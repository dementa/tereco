-- Nested sub-sub-questions (roman numerals). Run after 12-attendance-sessions.sql.
--
-- Additive: everything here can be applied to a database already holding
-- questions.

-- A lettered ('sub') part that has a roman-numeral ('subsub') run right
-- after it (config->>'groupKind') is a stem/prompt only — e.g. 41(b)
-- "Identify the parts labelled:" — never answered or marked itself; its
-- roman children carry the real question type, options, and marks. The old
-- inline check required every row to carry marks, which made a stem-only
-- row impossible to save. Which rows qualify is a config-shape rule (see
-- isStemParent in lib/questionGrouping.ts), not something a single-row CHECK
-- constraint can see, so this only widens the floor to zero; the app is
-- still the one place that enforces "must be > 0 unless it's a stem".
alter table public.questions drop constraint if exists questions_max_score_check;
alter table public.questions
  add constraint questions_max_score_check check (max_score >= 0);
