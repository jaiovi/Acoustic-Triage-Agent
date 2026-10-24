# Acoustic Triage Agent

An MVP support dashboard that accepts voice-report files or live microphone audio and routes transcripts into tickets with deterministic keyword rules.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/acoustic-triage-agent run dev` — run the dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; `RESON8_API_KEY` — server-side API key for realtime speech-to-text
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
- `artifacts/api-server/src/lib/realtime-proxy.ts` — browser-to-Reson8 WebSocket proxy; keeps the API key on the server
- `artifacts/api-server/src/lib/triage-service.ts` — shared classification and ticket persistence
- `artifacts/api-server/src/lib/triage-engine.ts` — pure keyword classifier and recommendations
- `artifacts/api-server/src/lib/mock-reson8.ts` — simulated 500 ms transcription adapter
- `artifacts/acoustic-triage-agent/src/` — dashboard and ticket detail UI

## Architecture decisions

- Uploaded WAV/MP3 files still use a transparent canned-transcript simulation. Live microphone sessions use the Reson8 realtime WebSocket API.
- The Reson8 API key is server-side only. Live audio is streamed to Reson8; this app does not persist raw audio.
- The React + Vite artifact uses the shared Express API service and generated OpenAPI helpers.
- The classifier is deterministic and runs in O(n) time for fixed keyword groups; unknown language routes to human review.

## Product

- Upload WAV/MP3 files for a clearly marked demo simulation, or stream microphone audio to Reson8 in real time. Both flows classify transcripts into audio capture, desktop crash, sync infrastructure, or human review and save tickets to the feed and detail page.

## User preferences

_The user wants the interface to follow the attached Jamie screenshot's clean white layout, horizontal navigation, and violet accent while keeping Acoustic branding._

## Gotchas

- To preview different simulated transcripts, use filenames containing `mic`/`audio`, `crash`/`tauri`, or `sync`/`nube`; other names select the human-review sample.
- After editing `lib/api-spec/openapi.yaml`, rerun API codegen before using its generated client or Zod schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
