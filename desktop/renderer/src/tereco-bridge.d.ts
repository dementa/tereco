/**
 * The complete surface the renderer is allowed to touch.
 *
 * Everything here is implemented in the Electron main process and reaches the
 * renderer through `contextBridge` in desktop/preload.js. The renderer holds no
 * database handle, no filesystem path and no Supabase client — main owns all
 * three. That split is what keeps the service-role key off the lab machines and
 * keeps a student from reading another student's data by poking at devtools.
 *
 * Phase 0 ships the contract and stub implementations. The SQLite work behind
 * it lands in Phases 1-3 of issue #33.
 */

export type SyncState = 'idle' | 'syncing' | 'complete' | 'failed';

export interface DeviceInfo {
  /** Stable per-installation id, included in attempt metadata so an admin can
   *  tell which machine a paper was sat on. */
  deviceId: string;
  appVersion: string;
}

export interface PreparedAssessment {
  assessmentId: string;
  title: string;
  /** Seconds. Comes from the signed package, never from the renderer. */
  durationSeconds: number;
  /** Epoch ms the sitting was anchored at, from `assessment_sittings.started_at`. */
  startedAt: number;
  questionCount: number;
}

export interface OfflineQuestion {
  id: string;
  position: number;
  code: string;
  questionText: string;
  questionType: string;
  options: string[];
  imageUrl?: string;
  maxScore?: number;
  config?: unknown;
}

export interface AttemptState {
  attemptId: string;
  assessmentId: string;
  /** Question id -> answer value. */
  answers: Record<string, string>;
  currentIndex: number;
  status: 'in_progress' | 'submitted';
  /** Seconds remaining, computed in main from the signed start time. */
  remainingSeconds: number;
}

export interface SyncStatus {
  state: SyncState;
  pending: number;
  total: number;
  lastError: string | null;
}

export interface PreparedResult {
  assessmentId: string;
  title: string;
  questionCount: number;
  startedAt: number;
  durationSeconds: number;
}

export interface SignedInUser {
  id: string;
  name: string;
  role: string;
}

export interface TerecoBridge {
  device(): Promise<DeviceInfo>;

  /**
   * The only calls that touch the network, and the only ones that need it.
   * They run in the main process, so the session cookie never exists anywhere
   * the page can read it.
   */
  signIn(credentials: { identifier: string; password: string }): Promise<SignedInUser | null>;
  signOut(): Promise<void>;
  /** Downloads, verifies and stores a paper. After this, the cable can come out. */
  prepare(assessmentSystemId: string): Promise<PreparedResult>;

  /** Null until an assessment package has been downloaded and verified. */
  getPackage(assessmentId: string): Promise<PreparedAssessment | null>;

  /** The paper, shaped the way the take screen expects. Correct answers are
   *  stripped server-side before the package is ever downloaded. */
  getQuestions(assessmentId: string): Promise<OfflineQuestion[]>;

  /** Every package on this machine that is ready to be sat. */
  listPrepared(): Promise<PreparedAssessment[]>;

  /** Resumes an interrupted attempt, or starts one if none exists. */
  getAttempt(assessmentId: string): Promise<AttemptState>;

  /**
   * Persists a single answer. Resolves only once the write has committed to
   * disk, so a power cut can lose at most the answer being typed.
   */
  saveAnswer(attemptId: string, questionId: string, value: string): Promise<void>;

  saveIndex(attemptId: string, currentIndex: number): Promise<void>;

  /** Marks the attempt submitted locally and enqueues it for sync. */
  submit(attemptId: string): Promise<{ queued: true }>;

  syncStatus(): Promise<SyncStatus>;

  /** Manual retry for the "Synchronization incomplete" state. */
  retrySync(): Promise<SyncStatus>;
}

declare global {
  interface Window {
    /** Undefined when the bundle is opened outside Electron (e.g. a browser). */
    tereco?: TerecoBridge;
  }
}

export {};
