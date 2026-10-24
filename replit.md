# Acoustic Triage Agent

An MVP dashboard that accepts voice-report files, simulates transcription, and routes support tickets with deterministic keyword rules.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/acoustic-triage-agent run dev` — run the dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Container build: `docker build -t acoustic-triage-agent .`; the image serves the built dashboard and API on port 5000.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract and generated client/Zod source
- `lib/db/src/schema/triage-tickets.ts` — persisted ticket schema
- `artifacts/api-server/src/routes/triage.ts` — API routes, upload validation, rate limiting, summary
- `artifacts/api-server/src/lib/triage-engine.ts` — pure keyword classifier and recommendations
- `artifacts/api-server/src/lib/mock-reson8.ts` — simulated 500 ms transcription adapter
- `artifacts/acoustic-triage-agent/src/` — dashboard and ticket detail UI

## Architecture decisions

- The transcription provider is intentionally simulated because no Reason8/Reson8 application API integration or endpoint details were available.
- Uploaded bytes are held in memory only long enough to validate the request; they are not decoded, persisted, or sent to a third party.
- The React + Vite artifact uses the shared Express API service and generated OpenAPI helpers.
- The classifier is deterministic and runs in O(n) time for fixed keyword groups; unknown language routes to human review.

## Product

- Upload WAV/MP3 files, receive a simulated transcript, classify it into audio capture, desktop crash, sync infrastructure, or human review, and view the saved ticket feed and detail page.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- To preview different simulated transcripts, use filenames containing `mic`/`audio`, `crash`/`tauri`, or `sync`/`nube`; other names select the human-review sample.
- After editing `lib/api-spec/openapi.yaml`, rerun API codegen before using its generated client or Zod schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
