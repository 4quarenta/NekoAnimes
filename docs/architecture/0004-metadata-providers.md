# ADR 0004 — Metadata providers

## Decision
NekoAnimes owns the canonical anime identity. External services are metadata providers, never primary keys.

Canonical identity uses UUID `anime.id`. Provider mappings live in `anime_external_ids` and support MAL, AniList and later TMDB.

MAL is the preferred catalog ingestion source. AniList is a secondary enrichment/cross-check provider. TMDB remains an adapter slot for a later phase rather than coupling the catalog to it now.

Provider credentials are server-only. The SPA and Android app never call MAL directly.

Imports are idempotent by `(provider, external_id)`: importing the same provider item updates the existing canonical record instead of duplicating it.

## Current endpoints
- `GET /v1/admin/metadata/:provider/search?q=...`
- `POST /v1/admin/metadata/:provider/import/:id`

Both are protected by the existing admin key guard.
