/**
 * The offline library: downloading it, and reading it back.
 *
 * The rules worth pinning are the ones that fail quietly — a failed request
 * wiping the machine's library, one learner's class material showing to the
 * next person at the desk, a quiz answer reaching the page before a choice —
 * so each has a check here.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// CommonJS because these modules also run in the Electron main process.
const require = createRequire(import.meta.url);
const { openDatabase } = require('../db/index.js');
const { createRepository } = require('../db/repository.js');
const { createLibraryRepository } = require('../db/library.js');
const { createLibrarySync } = require('./library-sync.js');

const BASE = 'https://tereco.example';

let dir;
let mediaDir;
let repo;
let library;

function item(overrides = {}) {
  return {
    id: 'doc-1',
    audience: 'public',
    title: 'Photosynthesis notes',
    description: 'Chapter 4',
    contentType: 'notes',
    fileFormat: 'pdf',
    learningArea: 'Science',
    authorName: 'T. Teacher',
    fileBytes: 1000,
    pageImageUrls: [`${BASE}/cdn/doc-1/p1`, `${BASE}/cdn/doc-1/p2`],
    streamUrl: null,
    thumbnailUrl: `${BASE}/cdn/doc-1/thumb`,
    quizzes: [
      {
        id: 'quiz-1',
        title: 'Check yourself',
        questions: [
          { id: 'q1', prompt: 'Where does it happen?', options: ['Leaf', 'Root'], correctIndex: 0, explanation: 'Chloroplasts.', imageUrl: `${BASE}/cdn/q1.png` },
        ],
      },
    ],
    version: 'v1',
    ...overrides,
  };
}

/** A fake server: the catalog at /api/library/offline, bytes for everything else. */
function fakeFetch(catalog, { fail = new Set() } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (url.endsWith('/api/library/offline')) {
      if (catalog === null) throw new Error('getaddrinfo ENOTFOUND');
      return new Response(JSON.stringify({ success: true, data: catalog }), { status: 200 });
    }
    if (fail.has(url)) return new Response('nope', { status: 500 });
    return new Response(`bytes of ${url}`, { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

function makeSync(fetchFn) {
  return createLibrarySync({ baseUrl: BASE, fetchFn, library, mediaDir });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tereco-library-'));
  mediaDir = path.join(dir, 'library-media');
  const db = openDatabase({ file: path.join(dir, 'tereco.db') });
  repo = createRepository(db);
  library = createLibraryRepository(db, { getActiveStudentId: repo.getActiveStudentId });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('library sync', () => {
  it('downloads a public item, its pages, thumbnail and quiz images, with nobody signed in', async () => {
    const status = await makeSync(fakeFetch({ viewerId: null, items: [item()] })).run();
    expect(status.state).toBe('complete');

    const [listed] = library.list();
    expect(listed).toMatchObject({ id: 'doc-1', quizCount: 1, personal: false });
    expect(listed.thumbnailUrl).toMatch(/^tereco-media:\/\/library\/[a-f0-9]{32}\.jpg$/);

    const full = library.getItem('doc-1');
    expect(full.pageImageUrls).toHaveLength(2);
    for (const url of full.pageImageUrls) {
      const name = url.replace('tereco-media://library/', '');
      expect(fs.existsSync(path.join(mediaDir, name))).toBe(true);
    }
    expect(full.downloadAvailable).toBe(false);
  });

  it('skips items whose version has not changed', async () => {
    await makeSync(fakeFetch({ viewerId: null, items: [item()] })).run();
    const again = fakeFetch({ viewerId: null, items: [item()] });
    await makeSync(again).run();
    expect(again.calls).toEqual([`${BASE}/api/library/offline`]);
  });

  it('keeps the whole library when the catalog cannot be fetched', async () => {
    await makeSync(fakeFetch({ viewerId: null, items: [item()] })).run();
    const status = await makeSync(fakeFetch(null)).run();
    expect(status.state).toBe('failed');
    expect(library.list()).toHaveLength(1);
  });

  it('removes items the server stops listing, and their files', async () => {
    await makeSync(fakeFetch({ viewerId: null, items: [item()] })).run();
    await makeSync(fakeFetch({ viewerId: null, items: [] })).run();
    expect(library.list()).toHaveLength(0);
    expect(fs.readdirSync(mediaDir)).toEqual([]);
  });

  it('keeps the previous copy when a new version fails to download, and still syncs the rest', async () => {
    await makeSync(fakeFetch({ viewerId: null, items: [item()] })).run();

    const broken = item({ version: 'v2', title: 'New title', pageImageUrls: [`${BASE}/cdn/doc-1/p1-new`] });
    const other = item({ id: 'doc-2', title: 'Other', version: 'v1', quizzes: [], pageImageUrls: [`${BASE}/cdn/doc-2/p1`] });
    const status = await makeSync(
      fakeFetch({ viewerId: null, items: [broken, other] }, { fail: new Set([`${BASE}/cdn/doc-1/p1-new`]) })
    ).run();

    expect(status.state).toBe('failed');
    expect(status.lastError).toContain('New title');
    expect(library.getItem('doc-1').title).toBe('Photosynthesis notes');
    expect(library.getItem('doc-2')).not.toBeNull();
  });

  it('streams a video to disk under its format extension', async () => {
    const video = item({ id: 'vid-1', contentType: 'video', fileFormat: 'mp4', pageImageUrls: null, streamUrl: `${BASE}/cdn/vid.mp4`, quizzes: [] });
    await makeSync(fakeFetch({ viewerId: null, items: [video] })).run();
    const { streamUrl } = library.getItem('vid-1');
    expect(streamUrl).toMatch(/\.mp4$/);
    const name = streamUrl.replace('tereco-media://library/', '');
    expect(fs.readFileSync(path.join(mediaDir, name), 'utf8')).toBe(`bytes of ${BASE}/cdn/vid.mp4`);
  });
});

describe('who sees what', () => {
  const personal = item({ id: 'class-doc', audience: 'personal', title: 'P.6 Blue only', quizzes: [], pageImageUrls: [`${BASE}/cdn/class/p1`] });

  it('shows targeted items only to the learner they were downloaded for', async () => {
    repo.signIn({ id: 'stu-1', name: 'Learner One' });
    await makeSync(fakeFetch({ viewerId: 'stu-1', items: [item(), personal] })).run();
    expect(library.list().map((i) => i.id).sort()).toEqual(['class-doc', 'doc-1']);

    repo.setActiveStudentId(null);
    expect(library.list().map((i) => i.id)).toEqual(['doc-1']);
    expect(library.getItem('class-doc')).toBeNull();

    repo.signIn({ id: 'stu-2', name: 'Learner Two' });
    expect(library.getItem('class-doc')).toBeNull();
  });

  it('does not prune one learner’s items on a sync made with nobody signed in', async () => {
    repo.signIn({ id: 'stu-1', name: 'Learner One' });
    await makeSync(fakeFetch({ viewerId: 'stu-1', items: [item(), personal] })).run();
    await makeSync(fakeFetch({ viewerId: null, items: [item()] })).run();

    repo.signIn({ id: 'stu-1', name: 'Learner One' });
    expect(library.getItem('class-doc')).not.toBeNull();
  });
});

describe('offline quizzes', () => {
  beforeEach(async () => {
    await makeSync(fakeFetch({ viewerId: null, items: [item()] })).run();
  });

  it('hands the page no answers or explanations', () => {
    const quiz = library.getPlayableQuiz('quiz-1');
    expect(quiz.questions[0]).toEqual({
      id: 'q1',
      prompt: 'Where does it happen?',
      options: ['Leaf', 'Root'],
      imageUrl: expect.stringMatching(/^tereco-media:\/\/library\/[a-f0-9]{32}\.png$/),
    });
  });

  it('marks an answer against the local copy', () => {
    expect(library.checkAnswer('quiz-1', 'q1', 1)).toEqual({ correct: false, correctIndex: 0, explanation: 'Chloroplasts.' });
    expect(library.checkAnswer('quiz-1', 'q1', 0).correct).toBe(true);
    expect(() => library.checkAnswer('quiz-1', 'nope', 0)).toThrow();
  });
});
