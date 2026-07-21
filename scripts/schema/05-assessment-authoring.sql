-- TERECO assessment authoring. Run after 04-notifications.sql.
--
-- Additive: everything here can be applied to a database already holding
-- assessments and responses.

-- ─── Paper instructions ─────────────────────────────────────────────────────
-- Printed at the top of the question paper. A learner sitting on paper has
-- nobody to ask, so how to answer and how to submit have to be on the sheet.
alter table public.assessments
  add column if not exists instructions text not null default '';

-- ─── Question media and marking guidance ────────────────────────────────────
alter table public.questions
  -- "Identify the computer part above" needs the part above.
  add column if not exists image_url       text,
  add column if not exists image_public_id text,
  -- What a good answer looks like, for hand-marked questions. Optional: a
  -- teacher in a hurry should still be able to publish a paper. Where it is
  -- absent the answer key prints "marker's discretion" rather than a blank.
  add column if not exists model_answer    text;

-- ─── True/false ─────────────────────────────────────────────────────────────
-- Added to the type check. Constraints have no ADD-OR-REPLACE, so the old one
-- is dropped first; the name is stable because it was declared inline.
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions
  add constraint questions_type_check check (type in (
    'mcq','checkbox','true_false','fill','matching','dragdrop','short','long'
  ));

-- A true/false question is a two-option multiple choice, so it needs choices
-- for the same reason mcq does.
alter table public.questions drop constraint if exists questions_choices_ck;
alter table public.questions
  add constraint questions_choices_ck check (
    type not in ('mcq','checkbox','true_false') or jsonb_array_length(options) > 0
  );

alter table public.questions drop constraint if exists questions_answerable_ck;
alter table public.questions
  add constraint questions_answerable_ck check (
    type not in ('mcq','checkbox','true_false','fill')
    or (correct_answer is not null and correct_answer <> '')
  );

-- ─── The correct answer must actually be one of the choices ─────────────────
-- Typing the correct answer by hand fails silently and totally: auto-scoring
-- normalises and compares strings, so one typo means every learner scores zero
-- on that question and nothing surfaces it until someone reads the marks. The
-- UI selects from the entered options; this is the backstop that makes it
-- impossible rather than merely unlikely.
--
-- 'fill' is exempt — it has no options, the expected answer is free text.
create or replace function public.correct_answer_is_valid(
  p_type text,
  p_options jsonb,
  p_correct text
)
returns boolean
language sql
immutable
as $$
  select case
    when p_correct is null then true          -- covered by questions_answerable_ck
    when p_type in ('mcq','true_false') then p_options ? p_correct
    when p_type = 'checkbox' then
      not exists (
        select 1
          from unnest(string_to_array(p_correct, '|')) as part
         where btrim(part) <> '' and not (p_options ? btrim(part))
      )
    else true
  end;
$$;

alter table public.questions drop constraint if exists questions_correct_in_options_ck;
alter table public.questions
  add constraint questions_correct_in_options_ck
  check (public.correct_answer_is_valid(type, options, correct_answer));

grant execute on function public.correct_answer_is_valid(text, jsonb, text) to service_role;
