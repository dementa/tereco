-- The offline library.
--
-- Unlike an assessment package, nothing here is authorisation-sensitive: these
-- are documents and untimed practice quizzes that record nothing. So there is
-- no signed grant — the catalog is simply copied down whenever the machine is
-- online, and the Library works with the internet off, before anyone signs in.
--
-- `owner_id` is '' for PUBLIC items (shown to anyone at the machine) and a
-- learner's profile id for items targeted at them (shown to that learner only).
-- The same document can therefore appear twice, once per owner, which is why
-- the key is (id, owner_id) rather than id alone.
--
-- A row is written only once every file it needs is on disk, in one
-- transaction with its quizzes. There is no 'preparing' state to leak: a
-- download cut off midway leaves the previous version (or nothing) listed.
-- Files live under <userData>/library-media and are referenced by file NAME,
-- never by absolute path, so the folder can move with the profile.

create table library_items (
  id              text not null,
  owner_id        text not null default '',
  title           text not null,
  description     text not null default '',
  content_type    text not null,
  file_format     text,
  learning_area   text,
  author_name     text not null default '',
  file_bytes      integer,
  -- Server-computed hash of the catalog entry. Unchanged => nothing re-downloads.
  version         text not null,
  stream_file     text,
  page_files_json text,
  thumbnail_file  text,
  synced_at       integer not null,
  primary key (id, owner_id)
);

create table library_quizzes (
  id             text not null,
  content_id     text not null,
  owner_id       text not null default '',
  position       integer not null,
  title          text not null,
  -- Questions WITH correct answers: offline there is no server to mark
  -- against. Each question's image is a local file name, or null.
  questions_json text not null,
  primary key (id, owner_id),
  foreign key (content_id, owner_id) references library_items (id, owner_id) on delete cascade
);

create index library_quizzes_content_idx on library_quizzes (content_id, owner_id, position);
