/**
 * Sections, multi-part questions ("22a, 22b, 22c"), and shared stimuli
 * ("Use the diagram below to answer questions 13 and 14") on top of what was
 * previously a flat, sequentially-numbered question list.
 *
 * Pure and framework-free by design: reused unchanged from Node API routes,
 * @react-pdf/renderer document builders, and 'use client' React components,
 * so numbering can never drift between what an author sees while building a
 * paper and what the server actually persists.
 */

export interface QuestionConfig {
  /** 'A' | 'B' | 'C' (free text) — undefined means no section. */
  section?: string;
  /**
   * Shared token linking every member of one authored group. Minted
   * client-side (crypto.randomUUID()) — never a database id or foreign key,
   * purely a config-time device for clustering rows that were saved together.
   */
  groupId?: string;
  /**
   * 'relative': each member keeps its own paper number (13, 14 — they just
   * share a heading/image). 'sub': the whole contiguous run consumes ONE
   * paper number, members get lettered suffixes (22a, 22b, 22c). 'subsub':
   * a run of roman-numeral parts nested under the single lettered member
   * immediately before it (41b, 41b(i), 41b(ii)) — only ever the tail of a
   * 'sub' run, never followed by another letter of that same run, because
   * computeCodes reads the parent's code by array position, not by pointer.
   */
  groupKind?: 'relative' | 'sub' | 'subsub';
  /**
   * Set only on a group's anchor (its first member in position order), only
   * when the author gave the shared image a caption, e.g. "The sketch map of
   * Africa". Feeds the auto-composed heading — the sentence itself is never
   * stored, only this title, so editing the group later (e.g. removing a
   * member) can't leave a stale sentence behind. The image itself is not
   * duplicated here — it lives in the anchor row's own imageUrl/imagePublicId
   * columns, reusing the existing upload plumbing.
   */
  groupImageTitle?: string;
}

export function readConfig(config: unknown): QuestionConfig {
  return config && typeof config === 'object' ? (config as QuestionConfig) : {};
}

interface Codeable {
  config?: unknown;
}

/**
 * The authoritative numbering pass. Input order IS position order — this app
 * has no reordering feature, so array order and position always agree.
 * Returns codes index-aligned to the input array.
 *
 * A 'sub' run (contiguous questions sharing config.groupId with
 * groupKind 'sub') consumes ONE integer for the whole run and gets lettered
 * suffixes a, b, c... A run of exactly one 'sub'-tagged question is treated
 * as standalone (no letter) — a defensive backstop in case a group shrinks to
 * one member and something failed to clear its group tag. Everything else —
 * standalone questions, and every member of a 'relative' group — consumes
 * its own integer, in order.
 *
 * Section changes never reset the counter: numbering is continuous across
 * sections (Section A: 1-10, Section B continues 11-20). A section is purely
 * a visual divider, not a renumbering point.
 *
 * A 'subsub' run nests under whichever code was JUST assigned to the letter
 * immediately before it in array order, and never touches the counter
 * itself. It can sit under ANY letter of the outer 'sub' run, not only the
 * last — the run-boundary scan below steps over an embedded 'subsub' block
 * without letting it end the outer run early, so "41a, 41b, 41b(i), 41b(ii),
 * 41c, 41d" numbers correctly (see addSubSubQuestion in the assessment
 * builder, which allows nesting under any letter for the same reason).
 */

/**
 * Scans forward from `from`, collecting every 'sub' member sharing
 * `groupId`, transparently stepping over (but not consuming) any 'subsub'
 * run in between so it doesn't look like the end of the run. `end` is the
 * index just past everything consumed (letters and any nested subsub
 * blocks) — i.e. where the run's next letter belongs. Shared by
 * computeCodes (numbering) and the assessment builder's addSubQuestion
 * (where to insert the next letter), so both agree on what "the end of this
 * lettered run" means.
 */
export function scanSubRun<T extends Codeable>(
  questions: T[],
  groupId: string,
  from: number
): { letterIndexes: number[]; end: number } {
  const letterIndexes: number[] = [];
  let j = from;
  while (j < questions.length) {
    const c = readConfig(questions[j].config);
    if (c.groupId === groupId && c.groupKind === 'sub') {
      letterIndexes.push(j);
      j++;
    } else if (c.groupKind === 'subsub') {
      const nestedId = c.groupId;
      while (j < questions.length && readConfig(questions[j].config).groupId === nestedId) j++;
    } else {
      break;
    }
  }
  return { letterIndexes, end: j };
}

export function computeCodes<T extends Codeable>(questions: T[]): string[] {
  const codes: string[] = new Array(questions.length);
  let counter = 0;
  let i = 0;
  while (i < questions.length) {
    const cfg = readConfig(questions[i].config);
    if (cfg.groupId && cfg.groupKind === 'sub') {
      const groupId = cfg.groupId;
      const { letterIndexes, end: j } = scanSubRun(questions, groupId, i);
      counter += 1;
      if (letterIndexes.length === 1) {
        codes[letterIndexes[0]] = `${counter}`;
      } else {
        letterIndexes.forEach((pos, k) => {
          codes[pos] = `${counter}${String.fromCharCode(97 + k)}`;
        });
      }
      // Now fill in any 'subsub' block(s) skipped over above, each parented
      // to whichever code was just assigned immediately before it.
      for (let k = i; k < j; k++) {
        if (codes[k] !== undefined) continue;
        const nestedId = readConfig(questions[k].config).groupId;
        let m = k;
        while (m < questions.length && readConfig(questions[m].config).groupId === nestedId) m++;
        assignSubsubCodes(codes, k, m, k > 0 ? codes[k - 1] : undefined, () => (counter += 1));
        k = m - 1;
      }
      i = j;
    } else if (cfg.groupId && cfg.groupKind === 'subsub') {
      // Reached directly rather than skipped-over above — its lettered
      // parent doesn't exist or isn't a 'sub' member immediately before it.
      // Defensive backstop: fall back to plain numbers.
      const groupId = cfg.groupId;
      let j = i;
      while (j < questions.length && readConfig(questions[j].config).groupId === groupId) j++;
      assignSubsubCodes(codes, i, j, i > 0 ? codes[i - 1] : undefined, () => (counter += 1));
      i = j;
    } else {
      counter += 1;
      codes[i] = `${counter}`;
      i += 1;
    }
  }
  return codes;
}

function assignSubsubCodes(
  codes: string[],
  start: number,
  end: number,
  parentCode: string | undefined,
  bumpCounter: () => number
): void {
  if (parentCode && end - start > 1) {
    for (let p = start; p < end; p++) codes[p] = `${parentCode}${toRoman(p - start + 1)}`;
  } else {
    // No lettered parent to nest under, or the run has shrunk to one — the
    // same defensive backstop as the 'sub' branch above.
    for (let p = start; p < end; p++) codes[p] = `${bumpCounter()}`;
  }
}

/**
 * True when `questions[index]` is a lettered ('sub') part whose very next
 * row starts a roman-numeral ('subsub') run — i.e. it's a stem/prompt only
 * ("Identify the parts labelled:") rather than an answerable question of its
 * own. Its roman children carry the actual question type, marks, and
 * answer; this row's own type/marks/answer fields are never read.
 * Framework-free like the rest of this file so the authoring UI, live
 * attempt screen, marking screens, PDF renderers, and results all agree on
 * which rows are stem-only without duplicating the check.
 */
export function isStemParent<T extends Codeable>(questions: T[], index: number): boolean {
  const current = questions[index];
  if (!current || readConfig(current.config).groupKind !== 'sub') return false;
  const next = questions[index + 1];
  return !!next && readConfig(next.config).groupKind === 'subsub';
}

/**
 * For a roman-numeral ('subsub') question, the array index of the lettered
 * ('sub') row it's nested under — the stem-only prompt printed once before
 * the run (e.g. 41(b) "Identify the parts labelled:"). Null for anything
 * else: not a 'subsub' row, or one with no valid lettered anchor (the
 * orphan case the assessment builder already prevents from persisting).
 * Shared so the live attempt screen, marking screens, PDF renderers, and
 * results all show the same stem text/image above the same roman children.
 */
export function stemParentIndex<T extends Codeable>(questions: T[], index: number): number | null {
  const cfg = readConfig(questions[index]?.config);
  if (cfg.groupKind !== 'subsub') return null;
  const groupId = cfg.groupId;
  let i = index;
  while (i > 0 && readConfig(questions[i].config).groupId === groupId) i--;
  return readConfig(questions[i]?.config).groupKind === 'sub' ? i : null;
}

/** Lowercase roman numerals, 1-indexed — exam sub-parts never run past (v) or (vi). */
function toRoman(n: number): string {
  const numerals: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let result = '';
  for (const [value, symbol] of numerals) {
    while (n >= value) {
      result += symbol;
      n -= value;
    }
  }
  return result;
}

/**
 * "13." for a plain number or any 'relative' group member. For a lettered
 * 'sub' run, UNEB prints the shared number once on the first part — "22. (a)"
 * — and every later part as a bare bracketed letter — "(b)", "(c)" — never
 * repeating the number. A nested 'subsub' (roman) run follows the identical
 * rule one level down: its first part repeats the letter — "(b) (i)" — and
 * later parts print the bare numeral — "(ii)". Callers pass whether this
 * member is the first in its group (group.members.map's own index === 0);
 * the plain-number branch below ignores it, so it's always safe to pass
 * regardless of the code's shape.
 */
export function formatQuestionLabel(code: string, isFirstInGroup: boolean): string {
  const roman = /^(\d+[a-z])([ivx]+)$/.exec(code);
  if (roman) {
    const [, letterCode, numeral] = roman;
    const letter = letterCode.slice(-1);
    return isFirstInGroup ? `(${letter}) (${numeral})` : `(${numeral})`;
  }
  const m = /^(\d+)([a-z])$/.exec(code);
  if (!m) return `${code}.`;
  const [, num, letter] = m;
  return isFirstInGroup ? `${num}. (${letter})` : `(${letter})`;
}

export interface QuestionGroup<T> {
  section?: string;
  /** True when this group starts a new section (or the paper's first section, if any). */
  sectionChanged: boolean;
  /** Composed fresh from groupImageTitle + the group's current member codes — never stored. */
  groupHeading?: string;
  groupImageUrl?: string;
  members: T[];
}

interface Groupable extends Codeable {
  position: number;
  code: string;
  imageUrl?: string;
}

/**
 * Clusters already-numbered items (each carrying its own `.code`, from
 * computeCodes or from the server) into display groups. Does NOT recompute
 * numbers — this is a pure display/render concern, reused identically by the
 * authoring UI, the student sitting screen, the printed PDFs, and the
 * marked-script/marking/results views. Works over Question[] or
 * MarkedAnswer[] alike — the two share exactly the fields this needs.
 */
export function groupQuestions<T extends Groupable>(items: T[]): QuestionGroup<T>[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const groups: QuestionGroup<T>[] = [];
  let prevSection: string | undefined;
  let first = true;
  let i = 0;
  while (i < sorted.length) {
    const cfg = readConfig(sorted[i].config);
    const groupId = cfg.groupId;
    let members: T[];
    if (groupId) {
      let j = i;
      members = [];
      while (j < sorted.length && readConfig(sorted[j].config).groupId === groupId) {
        members.push(sorted[j]);
        j++;
      }
      i = j;
    } else {
      members = [sorted[i]];
      i++;
    }
    const anchor = members[0];
    const anchorCfg = readConfig(anchor.config);
    groups.push({
      section: cfg.section,
      sectionChanged: first || cfg.section !== prevSection,
      groupHeading: anchorCfg.groupImageTitle
        ? composeHeading(anchorCfg.groupImageTitle, members.map((m) => m.code))
        : undefined,
      // Only a real multi-member group hoists its image above the shared
      // heading, matching how UNEB prints a stimulus shared by several
      // questions (e.g. "Use it to answer questions 18 and 19"). A
      // single-member "group" is just a standalone question with its own
      // image — that has to print inline with its own text (every renderer's
      // showOwnImage check falls back to it once groupImageUrl is unset
      // here), not floated above it as if it were a shared stimulus.
      groupImageUrl: members.length > 1 ? anchor.imageUrl : undefined,
      members,
    });
    prevSection = cfg.section;
    first = false;
  }
  return groups;
}

/** "Use {title} below to answer question 22." / "...questions 13 and 14." */
export function composeHeading(title: string, memberCodes: string[]): string {
  const numbers = Array.from(new Set(memberCodes.map((c) => c.match(/^\d+/)?.[0] ?? c)));
  const list =
    numbers.length === 1
      ? numbers[0]
      : numbers.length === 2
        ? `${numbers[0]} and ${numbers[1]}`
        : `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
  return `Use ${title} below to answer question${numbers.length === 1 ? '' : 's'} ${list}.`;
}
