import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, HardDrive, ListChecks, RefreshCw, Star, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { LibraryQuizPlayer } from "@/components/library/quiz/LibraryQuizPlayer";
import {
  HeroFeatures,
  LibraryHero,
  LibraryShelf,
  NO_FILTERS,
  subjectsOf,
  type ShelfFilters,
} from "@/components/library/public/LibraryShelfView";
import {
  LibraryItemSkeleton,
  LibraryItemView,
  relatedTo,
} from "@/components/library/public/LibraryItemView";
import { TerecoMark } from "@/components/pwa/TerecoMark";

import { useParams, useRouter } from "./shims/next-navigation";
import type {
  LibrarySyncStatus,
  OfflineLibraryItem,
  OfflineLibraryQuiz,
  OfflineLibrarySummary,
} from "./tereco-bridge";

/**
 * The offline library: the web Library's documents and practice quizzes, read
 * from this machine's own copy.
 *
 * Reachable before anyone signs in — public items are for whoever is at the
 * desk. A signed-in learner also sees what was targeted at their class. It
 * looks like the public web Library because it is drawn by the same
 * components (components/library/public: LibraryHero, LibraryShelf,
 * LibraryItemView); only where the data comes from differs (window.tereco
 * rather than the API), plus the sync line where the web has "save for
 * offline".
 */

function useLibraryStatus(): LibrarySyncStatus | null {
  const [status, setStatus] = useState<LibrarySyncStatus | null>(null);
  useEffect(() => {
    const bridge = window.tereco;
    if (!bridge) return;
    void bridge
      .libraryStatus()
      .then(setStatus)
      .catch(() => {});
    return bridge.onLibraryStatus(setStatus);
  }, []);
  return status;
}

/** The whole window scrolls as one; sticky bars stick to it. */
function Screen({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto bg-background">{children}</div>;
}

/** The web Library's header, with the way back out instead of "Sign in". */
function TopBar({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 overflow-hidden rounded-lg shadow-sm">
            <TerecoMark size={32} mark={0.62} />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-text-primary">
            TERECO <span className="font-medium text-text-muted">Library</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => router.push(href)}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-secondary hover:bg-bg-muted hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
        </button>
      </div>
    </div>
  );
}

/** Loaded once, then again on every sync event, so a first sync fills the shelf in as it goes. */
function useLibraryList(): OfflineLibrarySummary[] | null {
  // No bridge (a plain browser, a test) means nothing to load: an empty shelf, not a spinner.
  const [items, setItems] = useState<OfflineLibrarySummary[] | null>(() => (window.tereco ? null : []));
  useEffect(() => {
    const bridge = window.tereco;
    if (!bridge) return;
    const load = () =>
      bridge
        .libraryList()
        .then(setItems)
        .catch(() => setItems([]));
    void load();
    return bridge.onLibraryStatus(() => void load());
  }, []);
  return items;
}

// ─── Browse ────────────────────────────────────────────────────────────────

function SyncLine({ status }: { status: LibrarySyncStatus | null }) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    await window.tereco?.librarySync().catch(() => {});
    setBusy(false);
  };

  let text: string;
  if (!status || status.state === "idle")
    text = "The library is saved on this computer and works without internet.";
  else if (status.state === "syncing")
    text =
      status.total > 0
        ? `Downloading new items… ${status.done} of ${status.total}`
        : "Checking for new items…";
  else if (status.state === "failed" && status.lastSyncedAt === null)
    text =
      "No internet, so the library could not be updated. Everything below still works.";
  else if (status.state === "failed")
    text = `Some items could not be downloaded. ${status.lastError ?? ""}`;
  else
    text = `Up to date${status.lastSyncedAt ? ` · checked ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : ""}.`;

  return (
    <div className="mt-6 flex max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-white/80 px-4 py-2.5 text-sm text-text-secondary backdrop-blur">
      <HardDrive className="h-4 w-4 shrink-0 text-primary-700" aria-hidden />
      <p className="min-w-0 flex-1" role="status">
        {text}
      </p>
      <Button
        inline
        variant="ghost"
        onClick={() => void refresh()}
        isLoading={busy || status?.state === "syncing"}
      >
        <RefreshCw className="h-4 w-4" aria-hidden /> Update
      </Button>
    </div>
  );
}

export function LibraryHome({
  backHref,
  backLabel,
}: {
  backHref: string;
  backLabel: string;
}) {
  const status = useLibraryStatus();
  const items = useLibraryList();
  const [filters, setFilters] = useState<ShelfFilters>(NO_FILTERS);

  const list = useMemo(() => items ?? [], [items]);
  const subjects = subjectsOf(list);
  const forYou = list.filter((i) => i.personal).length;
  const stats =
    list.length === 0
      ? []
      : [
          { value: list.length, label: list.length === 1 ? "item on this computer" : "items on this computer" },
          ...(subjects.length ? [{ value: subjects.length, label: subjects.length === 1 ? "subject" : "subjects" }] : []),
          ...(forYou ? [{ value: forYou, label: "for you" }] : []),
        ];

  return (
    <Screen>
      <TopBar href={backHref} label={backLabel} />
      <LibraryHero
        eyebrow={
          <>
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> Works without internet
          </>
        }
        title="Your library, ready offline."
        subtitle="Notes, video lessons, past papers and practice quizzes from TERECO teachers — saved on this computer."
        q={filters.q}
        onSearch={(q) => setFilters((f) => ({ ...f, q }))}
        stats={stats}
        aside={
          <HeroFeatures
            features={[
              { icon: HardDrive, title: "Saved on this computer", body: "Everything opens with the internet off." },
              { icon: RefreshCw, title: "Updates itself", body: "New items download whenever there is internet." },
              { icon: ListChecks, title: "Practice quizzes", body: "Check what you learned, marked instantly." },
            ]}
          />
        }
      >
        <SyncLine status={status} />
      </LibraryHero>
      <LibraryShelf
        items={list}
        loading={items === null}
        empty={{
          title: "Nothing downloaded yet",
          body: "Connect this computer to the internet and the library will download on its own.",
        }}
        filters={filters}
        onFilter={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
        onClear={() => setFilters(NO_FILTERS)}
      />
    </Screen>
  );
}

// ─── One document ──────────────────────────────────────────────────────────

export function LibraryItemScreen() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<OfflineLibraryItem | null | undefined>(undefined);
  const all = useLibraryList();

  useEffect(() => {
    void window.tereco
      ?.libraryItem(id)
      .then(setItem)
      .catch(() => setItem(null));
  }, [id]);

  const personal = all?.find((i) => i.id === id)?.personal ?? false;

  return (
    <Screen>
      <TopBar href="/library" label="Back to library" />
      {item === undefined && <LibraryItemSkeleton />}
      {item === null && (
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h1 className="text-xl font-semibold text-text-primary">This item is not on this computer.</h1>
        </div>
      )}
      {item && (
        <LibraryItemView
          item={item}
          showDate={false}
          related={relatedTo(item, all ?? [])}
          aside={
            <p className="flex items-start gap-2.5 text-sm text-text-secondary">
              <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" aria-hidden />
              <span>
                <strong className="font-semibold text-text-primary">Saved on this computer.</strong>{" "}
                It opens without internet, and updates itself when this computer is online.
                {personal && (
                  <span className="mt-2 flex items-center gap-1.5 font-medium text-text-primary">
                    <Star className="h-4 w-4 text-accent-dark" aria-hidden /> Shared with your class
                  </span>
                )}
              </span>
            </p>
          }
        />
      )}
    </Screen>
  );
}

// ─── One quiz ──────────────────────────────────────────────────────────────

export function LibraryQuizScreen() {
  const { id, quizId } = useParams<{ id: string; quizId: string }>();
  const [quiz, setQuiz] = useState<OfflineLibraryQuiz | null | undefined>(
    undefined,
  );

  useEffect(() => {
    void window.tereco
      ?.libraryQuiz(quizId)
      .then(setQuiz)
      .catch(() => setQuiz(null));
  }, [quizId]);

  // Marked against this machine's copy — there is no server to ask offline.
  const check = useCallback(
    (questionId: string, choice: number) => {
      if (!window.tereco)
        return Promise.reject(
          new Error("The library is only available in TERECO Collect."),
        );
      return window.tereco.libraryCheckAnswer(quizId, questionId, choice);
    },
    [quizId],
  );

  return (
    <Screen>
      <TopBar href={`/library/${id}`} label="Back to the document" />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {quiz === undefined && (
        <p className="text-sm text-text-muted">Loading…</p>
      )}
      {quiz === null && (
        <p className="text-sm text-text-muted">
          This quiz is not on this computer.
        </p>
      )}
      {quiz && (
        <div>
          <h1 className="mb-5 break-words text-2xl font-bold text-primary-900">
            {quiz.title}
          </h1>
          <LibraryQuizPlayer quiz={quiz} check={check} />
        </div>
      )}
      </div>
    </Screen>
  );
}
