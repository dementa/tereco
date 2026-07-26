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
   * paper number, members get lettered suffixes (22a, 22b, 22c).
   */
  groupKind?: 'relative' | 'sub';
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
 */
export function computeCodes<T extends Codeable>(questions: T[]): string[] {
  const codes: string[] = new Array(questions.length);
  let counter = 0;
  let i = 0;
  while (i < questions.length) {
    const cfg = readConfig(questions[i].config);
    if (cfg.groupId && cfg.groupKind === 'sub') {
      const groupId = cfg.groupId;
      let j = i;
      while (j < questions.length && readConfig(questions[j].config).groupId === groupId) j++;
      counter += 1;
      if (j - i === 1) {
        codes[i] = `${counter}`;
      } else {
        for (let k = i; k < j; k++) codes[k] = `${counter}${String.fromCharCode(97 + (k - i))}`;
      }
      i = j;
    } else {
      counter += 1;
      codes[i] = `${counter}`;
      i += 1;
    }
  }
  return codes;
}

/**
 * "13." for a plain number or any 'relative' group member. For a lettered
 * 'sub' run, UNEB prints the shared number once on the first part — "22. (a)"
 * — and every later part as a bare bracketed letter — "(b)", "(c)" — never
 * repeating the number. Callers pass whether this member is the first in its
 * group (group.members.map's own index === 0); the plain-number branch below
 * ignores it, so it's always safe to pass regardless of the code's shape.
 */
export function formatQuestionLabel(code: string, isFirstInGroup: boolean): string {
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
