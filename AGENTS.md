# Agent Instructions

This repository includes an LLM-maintained personal knowledge base under `knowledge/`.

## LLM Wiki Scope

- Treat `knowledge/raw/` as the only default source inbox for wiki ingestion.
- Treat `knowledge/wiki/` as generated, maintained markdown owned by the LLM.
- Do not ingest existing project files unless the user explicitly names them.
- Do not read or use content from `vendor/`, `node_modules/`, `bootstrap/`, `store/`, `storage/`, system folders, cache/build output, secrets, or unrelated generated folders for wiki work.
- Never modify files in `knowledge/raw/`; raw sources are immutable source-of-truth inputs.

## Wiki Operating Model

- Read `knowledge/wiki/index.md` before answering wiki queries or planning wiki edits.
- Keep Obsidian-style links in the form `[[Page Name]]`.
- Prefer one durable page per source, entity, concept, or synthesis.
- Update existing pages instead of creating duplicates for the same subject.
- Record contradictions, superseded claims, and open questions explicitly.
- Cite source pages when making factual claims inside generated wiki pages.
- Append an entry to `knowledge/wiki/log.md` after every ingest, filed query, or lint pass.

## Ingest Workflow

1. Confirm the exact raw source file or user-provided source to ingest.
2. Read the source and create or update a source summary in `knowledge/wiki/sources/`.
3. Update relevant entity, concept, and synthesis pages.
4. Update `knowledge/wiki/index.md` with any new or changed pages.
5. Append a parseable log entry to `knowledge/wiki/log.md`.

## Query Workflow

1. Read `knowledge/wiki/index.md`.
2. Read the relevant wiki pages identified by the index.
3. Answer from the wiki first and cite the pages used.
4. If the answer is reusable, offer to file it as a synthesis page or do so when requested.

## Lint Workflow

Check for stale claims, contradictions, orphan pages, missing cross-links, raw files without source pages, duplicate pages, and index/log inconsistencies. Record lint results in `knowledge/wiki/log.md`.

## Page Conventions

Use concise YAML frontmatter where useful:

```yaml
---
type: source|entity|concept|synthesis|index|log
status: draft|active|stale
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Keep pages structured with short sections such as `Summary`, `Key Claims`, `Links`, `Contradictions`, and `Open Questions` when applicable.
