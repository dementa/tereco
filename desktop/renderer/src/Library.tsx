import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ListChecks,
  RefreshCw,
  Search,
  WifiOff,
} from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LibraryThumbnail } from "@/components/library/LibraryThumbnail";
import { LibraryFullScreenViewer } from "@/components/library/LibraryFullScreenViewer";
import { LibraryQuizPlayer } from "@/components/library/quiz/LibraryQuizPlayer";

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
 * desk. A signed-in learner also sees what was targeted at their class. The
 * viewers and the quiz player are the web app's own components; only where the
 * data comes from differs (window.tereco rather than the API).
 */

const TYPE_LABEL: Record<string, string> = {
  video: "Video",
  document: "Document",
  notes: "Notes",
  support_file: "Resource",
  audiobook: "Audiobook",
  past_paper: "Past paper",
  presentation: "Presentation",
};

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

function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-primary-700 mb-4 cursor-pointer"
    >
      <ArrowLeft className="w-4 h-4" aria-hidden /> {label}
    </button>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl p-6">{children}</div>
    </div>
  );
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
    <div className="flex items-center gap-3 text-sm text-neutral-600">
      <WifiOff className="h-4 w-4 shrink-0 text-primary-700" aria-hidden />
      <p className="flex-1" role="status">
        {text}
      </p>
      <Button
        inline
        variant="ghost"
        onClick={() => void refresh()}
        isLoading={busy || status?.state === "syncing"}
      >
        <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Update
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
  const router = useRouter();
  const status = useLibraryStatus();
  const [items, setItems] = useState<OfflineLibrarySummary[] | null>(null);
  const [query, setQuery] = useState("");

  // Loaded once, then again on every sync progress event, so a learner
  // watching the first sync sees the library fill in rather than an empty
  // page until they leave and come back.
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

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !items) return items ?? [];
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(needle) ||
        i.description.toLowerCase().includes(needle) ||
        (i.learningArea ?? "").toLowerCase().includes(needle),
    );
  }, [items, query]);

  return (
    <Screen>
      <BackLink href={backHref} label={backLabel} />
      <header className="mb-4 space-y-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary-900">
          <BookOpen className="h-6 w-6" aria-hidden /> Library
        </h1>
        <SyncLine status={status} />
      </header>

      <label className="relative mb-5 block">
        <span className="sr-only">Search the library</span>
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, subject or description"
          className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-primary-700 focus:outline-none"
        />
      </label>

      {items === null ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-text-muted">
          {items.length === 0
            ? "Nothing has been downloaded yet. Connect this computer to the internet and the library will download on its own."
            : "Nothing matches that search."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => router.push(`/library/${item.id}`)}
                className="block w-full text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40 cursor-pointer"
              >
                <Card hover className="!p-0 overflow-hidden h-full">
                  <LibraryThumbnail
                    item={item}
                    aspectClassName="aspect-[3/4]"
                  />
                  <div className="p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                      {TYPE_LABEL[item.contentType] ?? item.contentType}
                    </p>
                    <p className="mt-1 line-clamp-2 font-medium text-primary-900">
                      {item.title}
                    </p>
                    {item.quizCount > 0 && (
                      <p className="mt-1 text-xs text-text-muted">
                        {item.quizCount} quiz{item.quizCount === 1 ? "" : "zes"}
                      </p>
                    )}
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

// ─── One document ──────────────────────────────────────────────────────────

export function LibraryItemScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<OfflineLibraryItem | null | undefined>(
    undefined,
  );
  const [reading, setReading] = useState(false);

  useEffect(() => {
    void window.tereco
      ?.libraryItem(id)
      .then(setItem)
      .catch(() => setItem(null));
  }, [id]);

  return (
    <Screen>
      <BackLink href="/library" label="Back to library" />
      {item === undefined && (
        <p className="text-sm text-text-muted">Loading…</p>
      )}
      {item === null && (
        <p className="text-sm text-text-muted">
          This item is not on this computer.
        </p>
      )}
      {item && (
        <div className="max-w-3xl space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-bg-muted px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary-700">
                {TYPE_LABEL[item.contentType] ?? item.contentType}
              </span>
              {item.learningArea && (
                <span className="rounded-full bg-bg-muted px-2.5 py-1 text-xs font-medium text-text-secondary">
                  {item.learningArea}
                </span>
              )}
            </div>
            <h1 className="break-words text-2xl font-bold text-primary-900">
              {item.title}
            </h1>
            {item.authorName && (
              <p className="mt-1 text-sm text-text-muted">
                By {item.authorName}
              </p>
            )}
          </div>

          {item.description && (
            <p className="whitespace-pre-line text-sm text-text-secondary">
              {item.description}
            </p>
          )}

          <Card className="!p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setReading(true)}
              className="group block w-full cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
              aria-label={`Open ${item.title}`}
            >
              <LibraryThumbnail item={item} aspectClassName="aspect-video" />
              <span className="flex items-center justify-center gap-2 bg-primary-700 py-3 text-sm font-semibold text-white group-hover:bg-primary-800">
                <BookOpen className="h-4 w-4" aria-hidden /> Open
              </span>
            </button>
          </Card>

          <section aria-labelledby="quizzes-heading">
            <h2
              id="quizzes-heading"
              className="mb-3 flex items-center gap-2 text-lg font-semibold text-primary-900"
            >
              <ListChecks className="h-5 w-5" aria-hidden /> Quizzes
            </h2>
            {item.quizzes.length === 0 ? (
              <p className="text-sm text-text-muted">
                No quizzes for this document yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {item.quizzes.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/library/${item.id}/quiz/${q.id}`)
                      }
                      className="block w-full cursor-pointer rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
                    >
                      <Card
                        hover
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-primary-900">
                            {q.title}
                          </p>
                          <p className="text-xs text-text-muted">
                            {q.questionCount} question
                            {q.questionCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-medium text-primary-700">
                          Take quiz
                        </span>
                      </Card>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {item && reading && (
        <LibraryFullScreenViewer
          item={item}
          feedback={false}
          onClose={() => setReading(false)}
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
      <BackLink href={`/library/${id}`} label="Back to the document" />
      {quiz === undefined && (
        <p className="text-sm text-text-muted">Loading…</p>
      )}
      {quiz === null && (
        <p className="text-sm text-text-muted">
          This quiz is not on this computer.
        </p>
      )}
      {quiz && (
        <div className="max-w-3xl">
          <h1 className="mb-5 break-words text-2xl font-bold text-primary-900">
            {quiz.title}
          </h1>
          <LibraryQuizPlayer quiz={quiz} check={check} />
        </div>
      )}
    </Screen>
  );
}
