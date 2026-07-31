-- Run after 17-library.sql.
--
-- PDF-format Library uploads now go through Cloudinary as `image` resource
-- type instead of `raw`: this account blocks serving raw PDF bytes outright
-- (confirmed live, 2026-07-31 — 401 "deny or ACL failure" even on an
-- authenticated server-side fetch), but converting pages to JPGs on
-- delivery (`pg_N,f_jpg`) is not subject to the same restriction. The
-- viewer needs to know how many pages to render — Cloudinary returns this
-- as `pages` in the upload response for image-type resources.
alter table public.library_content
  add column if not exists page_count int check (page_count is null or page_count > 0);
