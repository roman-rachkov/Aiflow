-- Runs once, on first container start, against the ai_studio database.
--
-- The pgvector image ships the extension binary but does not enable it. RAG
-- chunks live in per-project schemas (DocumentChunk), and a project schema is
-- created at runtime by generated SQL — which cannot itself CREATE EXTENSION,
-- since that is database-scoped and requires superuser. So it happens here.
CREATE EXTENSION IF NOT EXISTS vector;

-- Used for gen_random_uuid() in the generated project-schema DDL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
