-- Kolk Arena — ChallengeBrief Preview schema cleanup
--
-- Drops `idx_ka_brief_showcases_batch` — a redundant b-tree index on
-- (batch_id, slot_index) that duplicates the auto-index Postgres already
-- creates to back `UNIQUE (batch_id, slot_index)` on `ka_brief_showcases`.
-- Keeping both costs write-time I/O and storage for zero query benefit.
--
-- Safe to run on any environment: `DROP INDEX IF EXISTS` is a no-op when
-- the index is absent (e.g. a fresh environment that picks up the
-- already-fixed `00018_brief_showcase.sql` and never creates this index).

DROP INDEX IF EXISTS public.idx_ka_brief_showcases_batch;
