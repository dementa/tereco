import type { QuestionConfig } from "@/lib/questionGrouping";

/**
 * Where a paper's data comes from.
 *
 * In the browser it is the API over `fetch`, with progress kept in
 * localStorage. In TERECO Collect it is the local SQLite database reached
 * through `window.tereco`, with no network at all — the lab switches the
 * internet off after a learner signs in (issue #33).
 *
 * One interface rather than two copies of the take screen. The alternative was
 * a desktop fork of AssessmentTake, and forks of this component drift: the
 * `true_false` note in its own header is a record of what drift already cost
 * once, when a question type rendered as unanswerable text for every learner
 * who met it.
 */

export type QuestionType =
  | "mcq"
  | "checkbox"
  | "true_false"
  | "fill"
  | "matching"
  | "dragdrop"
  | "short"
  | "long";

export interface SourceQuestion {
  id: string;
  code: string;
  position: number;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  imageUrl?: string;
  maxScore?: number;
  config?: QuestionConfig;
}

export interface PaperContext {
  studentId: string;
  assessmentId: string;
  /** Set by the desktop source: the local attempt being sat. */
  attemptId?: string;
}

export interface LoadedPaper {
  title: string;
  /** Seconds. 0 means untimed. */
  timeLimitSeconds: number;
  questions: SourceQuestion[];
  answers: Record<string, string>;
  currentIndex: number;
  /**
   * Authoritative seconds remaining, or null when it could not be established.
   *
   * Null is the offline-in-a-browser case, where the countdown falls back to a
   * locally remembered start. The desktop source never returns null: its clock
   * comes from the signed package and is floored against tampering, so there is
   * nothing to fall back to.
   */
  remainingSeconds: number | null;
  attemptId?: string;
}

export interface AssessmentSource {
  load(context: PaperContext): Promise<LoadedPaper>;
  saveProgress(context: PaperContext, answers: Record<string, string>, currentIndex: number): void;
  clearProgress(context: PaperContext): void;
  /** Locally remembered countdown start, used only when `remainingSeconds` is null. */
  readStart(context: PaperContext): number | null;
  writeStart(context: PaperContext, value: number): void;
  submit(
    context: PaperContext,
    payload: { answers: Record<string, string>; timeSpent: number }
  ): Promise<void>;
}

// ─── Browser: the API over fetch ───────────────────────────────────────────

function progressKey(studentId: string, assessmentId: string, part: string): string {
  return `tereco_take_${studentId}_${assessmentId}_${part}`;
}

/**
 * Reads the new key, then the old sessionStorage one.
 *
 * Anyone sitting a paper at the moment the localStorage change shipped has
 * their answers under the old scheme; without this fallback their next reload
 * would find nothing and silently discard the lot.
 */
function readProgress(studentId: string, assessmentId: string, part: string): string | null {
  return (
    localStorage.getItem(progressKey(studentId, assessmentId, part)) ??
    sessionStorage.getItem(`assessment_${assessmentId}_${part}`)
  );
}

export const webSource: AssessmentSource = {
  async load({ studentId, assessmentId }) {
    const metaRes = await fetch(`/api/assessments/${assessmentId}`);
    if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}: ${metaRes.statusText}`);
    const metaData = await metaRes.json();
    if (!metaData.success) throw new Error(metaData.message || "Assessment not found");

    const qRes = await fetch(`/api/assessments/${assessmentId}/questions`);
    if (!qRes.ok) throw new Error(`HTTP ${qRes.status}: ${qRes.statusText}`);
    const qData = await qRes.json();
    if (!qData.success) throw new Error(qData.message || "Failed to load questions");

    const savedAnswers = readProgress(studentId, assessmentId, "answers");
    let answers: Record<string, string> = {};
    if (savedAnswers) {
      try {
        answers = JSON.parse(savedAnswers);
      } catch {
        /* ignore */
      }
    }

    const savedIndex = readProgress(studentId, assessmentId, "index");

    /**
     * Ask the server when this sitting started.
     *
     * If it fails — most likely no connection — the paper still opens and the
     * countdown falls back to a locally held start, so the learner is never
     * blocked from working. It re-anchors when the network returns.
     */
    let remainingSeconds: number | null = null;
    try {
      const sRes = await fetch(`/api/assessments/${assessmentId}/sitting`, { method: "POST" });
      const sData = await sRes.json();
      if (sData.success && typeof sData.data?.remainingSeconds === "number") {
        remainingSeconds = sData.data.remainingSeconds;
      }
    } catch {
      /* offline — the local clock carries the sitting until we reconnect */
    }

    const meta = metaData.data;
    return {
      title: meta?.title ?? "Assessment",
      timeLimitSeconds: (meta?.timeLimit ?? 0) * 60,
      questions: Array.isArray(qData.data) ? qData.data : [],
      answers,
      currentIndex: savedIndex ? parseInt(savedIndex, 10) || 0 : 0,
      remainingSeconds,
    };
  },

  saveProgress({ studentId, assessmentId }, answers, currentIndex) {
    if (Object.keys(answers).length > 0) {
      localStorage.setItem(progressKey(studentId, assessmentId, "answers"), JSON.stringify(answers));
    }
    localStorage.setItem(progressKey(studentId, assessmentId, "index"), currentIndex.toString());
  },

  clearProgress({ studentId, assessmentId }) {
    // Clear both schemes: the old sessionStorage keys may still hold this
    // learner's answers if they started before the localStorage change shipped.
    for (const part of ["answers", "index", "start"]) {
      localStorage.removeItem(progressKey(studentId, assessmentId, part));
      sessionStorage.removeItem(`assessment_${assessmentId}_${part}`);
    }
  },

  readStart({ studentId, assessmentId }) {
    const stored = readProgress(studentId, assessmentId, "start");
    return stored ? parseInt(stored, 10) : null;
  },

  writeStart({ studentId, assessmentId }, value) {
    localStorage.setItem(progressKey(studentId, assessmentId, "start"), value.toString());
  },

  async submit({ assessmentId }, payload) {
    const res = await fetch(`/api/assessments/${assessmentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || "Submission failed.");
  },
};

// ─── Desktop: the local database over IPC ──────────────────────────────────

/** The slice of `window.tereco` the take screen needs. Full contract lives in
 *  desktop/renderer/src/tereco-bridge.d.ts. */
interface TerecoBridgeSlice {
  getPackage(assessmentId: string): Promise<{
    title: string;
    durationSeconds: number;
  } | null>;
  getQuestions(assessmentId: string): Promise<SourceQuestion[]>;
  getAttempt(assessmentId: string): Promise<{
    attemptId: string;
    answers: Record<string, string>;
    currentIndex: number;
    remainingSeconds: number;
    status: "in_progress" | "submitted";
  }>;
  saveAnswer(attemptId: string, questionId: string, value: string): Promise<void>;
  saveIndex(attemptId: string, currentIndex: number): Promise<void>;
  submit(attemptId: string): Promise<{ queued: true }>;
}

function bridge(): TerecoBridgeSlice {
  const found = (globalThis as { tereco?: TerecoBridgeSlice }).tereco;
  if (!found) throw new Error("This paper can only be opened in TERECO Collect.");
  return found;
}

/**
 * Builds a desktop source for one sitting.
 *
 * A factory rather than a shared singleton because of the write cache below:
 * it describes what this sitting has already put on disk, and a cache outliving
 * the sitting it belongs to would start answering for the next one.
 */
export function createDesktopSource(): AssessmentSource {
  /**
   * Answers already written to SQLite, so a re-render does not rewrite them all.
   *
   * `saveProgress` runs from a React effect on every answer change and receives
   * the whole map. Each write costs an fsync — the connection runs
   * `synchronous = FULL` so a power cut cannot lose a committed answer — and
   * replaying every answer on every keystroke would put a growing pile of disk
   * I/O directly in the path of typing.
   */
  const written = new Map<string, string>();

  return {
    async load({ assessmentId }) {
      const api = bridge();

      const pkg = await api.getPackage(assessmentId);
      if (!pkg) {
        throw new Error("This assessment has not been prepared on this computer.");
      }

      const [questions, attempt] = await Promise.all([
        api.getQuestions(assessmentId),
        api.getAttempt(assessmentId),
      ]);

      return {
        title: pkg.title,
        timeLimitSeconds: pkg.durationSeconds,
        questions,
        answers: attempt.answers,
        currentIndex: attempt.currentIndex,
        // Never null: the clock comes from the signed package and is floored
        // against tampering, so there is no local fallback to degrade to.
        remainingSeconds: attempt.remainingSeconds,
        attemptId: attempt.attemptId,
      };
    },

    /**
     * Never throws.
     *
     * This runs from a React passive effect on every answer change, and an
     * exception escaping an effect tears down the tree — losing the paper a
     * learner is part-way through, to report that one write did not happen.
     * That trade is unacceptable: the answer is still in React state, still on
     * screen, and the next change retries it.
     *
     * Failures are logged and the cache entry is left off so the retry happens.
     * The learner is not told, because there is nothing they could do and the
     * work has not actually been lost yet; a database that is genuinely
     * unreachable surfaces on the next read, which is a screen that can explain
     * itself.
     */
    saveProgress({ attemptId }, answers, currentIndex) {
      if (!attemptId) return;

      const api = (globalThis as { tereco?: TerecoBridgeSlice }).tereco;
      if (!api) {
        console.warn('[tereco] no local bridge available; progress not written');
        return;
      }

      for (const [questionId, value] of Object.entries(answers)) {
        if (written.get(questionId) === value) continue;
        written.set(questionId, value);

        /**
         * Not awaited: the IPC call resolves only once the row has been
         * fsynced, and blocking the render on that would stutter typing.
         *
         * The cache entry is rolled back if the write fails, so the next change
         * retries it. Recording it optimistically would mark an answer saved
         * that never reached the disk, and this application exists because
         * learners lost answers they believed were saved.
         */
        try {
          void api.saveAnswer(attemptId, questionId, value).catch(() => {
            if (written.get(questionId) === value) written.delete(questionId);
          });
        } catch {
          // A synchronous throw from the bridge itself, not a rejected write.
          written.delete(questionId);
        }
      }

      try {
        void api.saveIndex(attemptId, currentIndex).catch(() => {});
      } catch {
        /* position is a convenience; never worth breaking the paper for */
      }
    },

    clearProgress() {
      // Nothing to clear. The attempt is marked submitted in SQLite and stays
      // there until it has synced — deleting it is what would lose the work.
    },

    readStart() {
      return null;
    },

    writeStart() {
      /* the signed package owns the clock */
    },

    async submit({ attemptId }) {
      if (!attemptId) throw new Error("No attempt is open on this computer.");
      await bridge().submit(attemptId);
    },
  };
}

/**
 * Picks the source for wherever this is running.
 *
 * Presence of the bridge is the signal, not a build flag: the same bundle is
 * the web app and, compiled by desktop/renderer, the offline client.
 */
export function resolveSource(): AssessmentSource {
  return typeof globalThis !== "undefined" &&
    (globalThis as { tereco?: unknown }).tereco !== undefined
    ? createDesktopSource()
    : webSource;
}
