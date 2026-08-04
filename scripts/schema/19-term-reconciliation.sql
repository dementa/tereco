-- TERECO term reconciliation. Run after 18-library-pdf-pages.sql.
--
-- Additive and idempotent: safe to run more than once, and safe on a database
-- already holding lesson reports.
--
-- ─── The bug ────────────────────────────────────────────────────────────────
-- lesson_reports.term_id is resolved by trg_lesson_reports_term at write time
-- (03-collection.sql). That is the right design — it stops a caller filing a
-- report into a term of their choosing — but it has one failure mode nobody
-- closed: if the matching `terms` row does not exist YET when the report is
-- filed, term_for_date() returns null and the report is permanently detached
-- from its term. Nothing ever revisits it.
--
-- That is not hypothetical. As of 2026-08-03, 31 of 35 lesson reports are
-- affected: Ebenezer's Term 1 (2026-06-25 .. 2026-08-17) was created on
-- 2026-08-01, but reports had been filed against it since 2026-07-21. Every
-- one of those reports falls inside the term and none of them knows it. Any
-- term-grain report — "this term versus last" — silently under-counts rather
-- than failing, which is the worst way for a metric to be wrong.
--
-- 03-collection.sql:262 already promised the cure ("see reconcile_terms() for
-- when term dates get corrected"). The function was never written. This is it.

-- ─── Stop a reconcile from looking like an edit ──────────────────────────────
-- The existing trigger bumps updated_at on every UPDATE. Backfilling term_id
-- would therefore restamp every affected report as freshly edited, which is
-- false, and would destroy the only record of which reports genuinely were.
--
-- Staff do revise reports after filing — 11 of the 39 held on 2026-08-04 were
-- updated hours after they were created — so updated_at carries real signal
-- and clobbering it would erase a real distinction, not a theoretical one.
-- Bump it only when the caller actually changed something themselves; a term
-- reconcile is bookkeeping, not an edit.
create or replace function public.set_lesson_report_term()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.term_id := public.term_for_date(new.school_id, new.lesson_date);

  if TG_OP = 'INSERT' then
    new.updated_at := now();
  elsif (to_jsonb(new) - 'term_id' - 'updated_at')
     is distinct from
        (to_jsonb(old) - 'term_id' - 'updated_at') then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-- ─── The reconcile ──────────────────────────────────────────────────────────
-- Re-resolves term_id for lesson reports from their own date and school.
-- Handles both directions:
--   * reports filed before their term row existed  (term_id null -> set)
--   * reports whose term dates were later corrected (term_id wrong -> moved,
--     or nulled if the corrected dates no longer cover the lesson)
--
-- Scoped to one school when p_school_id is given, every school otherwise.
-- Returns the number of rows whose term actually changed, so a caller can log
-- or surface it rather than guessing whether it did anything.
--
-- Deliberately touches only lesson_reports. assessments.term_id looks like it
-- belongs here too, but it does not: an assessment is targeted through
-- assessment_targets and may span several schools (or none, meaning every
-- school), while terms are per-school. There is no single correct term for a
-- multi-school assessment, which is why nothing has ever populated that column
-- and why all 15 rows are null. A submission, by contrast, is unambiguous — it
-- carries enrollment_id, and that resolves to exactly one school — so the term
-- for assessment work is resolved per submission at read time instead. See
-- getStudentTermAverages in lib/entities/performance.ts.
create or replace function public.reconcile_terms(p_school_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer;
begin
  with resolved as (
    select lr.id,
           lr.term_id                                            as old_term,
           public.term_for_date(lr.school_id, lr.lesson_date)     as new_term
      from public.lesson_reports lr
     where p_school_id is null or lr.school_id = p_school_id
  )
  update public.lesson_reports lr
     set term_id = r.new_term
    from resolved r
   where lr.id = r.id
     and r.old_term is distinct from r.new_term;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

grant execute on function public.reconcile_terms(uuid) to service_role;

-- ─── Keep it from drifting again ────────────────────────────────────────────
-- Creating or re-dating a term is the only event that can invalidate an
-- already-resolved term_id, so reconcile right there. Statement-level and
-- scoped to the school that changed: a term edit at one school has no bearing
-- on another's reports.
create or replace function public.reconcile_terms_after_term_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.reconcile_terms(
    coalesce(new.school_id, old.school_id)
  );
  return null;
end;
$$;

drop trigger if exists trg_terms_reconcile on public.terms;
create trigger trg_terms_reconcile
  after insert or update of starts_on, ends_on, school_id or delete
  on public.terms
  for each row execute function public.reconcile_terms_after_term_change();

-- ─── Backfill the damage already done ───────────────────────────────────────
-- Idempotent: on a healthy database this changes nothing and returns 0.
select public.reconcile_terms() as reports_reattached_to_their_term;
