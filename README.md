# Acoustic Triage Agent

An MVP support dashboard for turning customer voice reports into categorized
support tickets. It includes live speech-to-text through Reson8, a visible
rulebook, ticket summaries, and ticket details.

## Install on Windows, macOS, or Linux

The easiest way to run the complete app on a personal computer is Docker
Compose. This starts the web app and API, creates a local PostgreSQL database,
and applies the database schema automatically.

### 1. Install Docker

- **Windows or macOS:** install Docker Desktop and open it.
- **Linux:** install Docker Engine and the Docker Compose v2 plugin.

Open a new terminal after installing Docker. Confirm the commands work:

```sh
docker --version
docker compose version
```

### 2. Get the project files

If you have a Git repository:

```sh
git clone <repository-url>
cd <repository-folder>
```

Or download the project as a ZIP, extract it, then open a terminal in the
extracted project folder.

### 3. Create the local settings file

macOS / Linux / Git Bash:

```sh
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` in a text editor. Set `RESON8_API_KEY` to your Reson8 API key to
enable live transcription. Leave it empty to run the dashboard without live
transcription. The key is passed only to the server; it is never sent to the
browser. Do not commit or share `.env`.

The included Compose setup creates its own local database, so no separate
PostgreSQL installation is needed.

### 4. Start the app

From the project folder:

```sh
docker compose up --build
```

The first start downloads the required images, builds the app, creates the
database tables, and may take several minutes. When the logs show the API server
is listening, open:

**http://localhost:5000**

`localhost` is your own computer. The app is bound to the local computer only;
other devices on your network cannot access it through this Compose setup.

### 5. Stop and restart

- Stop the running app with **Ctrl+C**.
- Stop containers while keeping saved tickets:

  ```sh
  docker compose down
  ```

- Start it again:

  ```sh
  docker compose up
  ```

Tickets remain in the local Docker volume when containers are stopped. To
permanently delete the local database and all its tickets, run:

```sh
docker compose down --volumes
```

This last command is destructive and cannot be undone.

### Troubleshooting

- **Port 5000 is already in use:** change the left side of the `ports` entry in
  `compose.yaml`, for example from `127.0.0.1:5000:5000` to
  `127.0.0.1:8088:5000`, then open `http://localhost:8088`.
- **Live transcription says the service is unavailable:** check that
  `RESON8_API_KEY` in `.env` is correct, then restart with
  `docker compose up --build`.
- **The microphone is blocked:** allow microphone access for `localhost` in
  your browser. Use the Realtime tab and select **Start live transcription**.
- **See app logs:** in another terminal run `docker compose logs --follow app`.
- **Check API health:** open `http://localhost:5000/api/healthz`.
- **Database migration failed:** check `docker compose logs migrate` and
  `docker compose logs database`.

## What the app does

1. A user selects **Realtime** and grants microphone permission.
2. The browser streams audio chunks to the app's same-origin WebSocket route,
   `/api/realtime`.
3. The API server connects to Reson8's default realtime Speech-to-Text
   endpoint using `RESON8_API_KEY`. It does not send a voice ID, custom model
   ID, or language query parameter; Reson8 detects the language automatically.
4. When the recording is stopped, the server finalizes the transcript, runs the
   ordered rulebook, saves a ticket in PostgreSQL, and returns the result to the
   dashboard.
5. The ticket feed and summary refresh after the new ticket is saved.

Acoustic does not store raw microphone audio. The resulting transcript and
ticket fields are stored in PostgreSQL. Uploaded WAV/MP3 files are currently a
clearly labeled demo simulation: the bytes are not transcribed; a canned
transcript is selected from the filename.

## Rulebook and routing

Open **Rulebook** in the top navigation to see the rules the classifier uses.
The same ordered definitions drive the API classification and the Rulebook
screen; they are maintained in
`artifacts/api-server/src/lib/triage-engine.ts`.

The classifier normalizes transcript text and searches for the rulebook's
English and Spanish match terms. Rules run in this order:

1. **Desktop client crash** — high priority.
2. **Microphone and audio capture** — normal priority.
3. **Sync and cloud infrastructure** — normal priority.
4. **Human review fallback** — high priority, only if none of the earlier rules
   match.

When a transcript matches more than one rule, the first rule in that order is
used. The browser language detector does not dictate classification; the
rulebook searches the resulting transcript text.
Rule changes apply to new tickets; previously saved ticket categories are not
automatically rewritten.

## Navigation

- **Overview** — ticket summary, intake, and category distribution.
- **Ticket feed** — scrolls to the latest saved tickets; each ticket opens its
  detail page.
- **Rulebook** — shows the ordered routing terms, examples, and recommended
  actions returned by `GET /api/rulebook`.
- **Start intake** — jumps to the Upload / Realtime controls.

## Technical overview

| Area | Technology |
| --- | --- |
| Web app | React, TypeScript, Vite, Wouter |
| Data fetching | TanStack Query and generated Orval hooks |
| API | Express 5, TypeScript, Zod |
| Live speech | Reson8 realtime Speech-to-Text WebSocket |
| Database | PostgreSQL and Drizzle ORM |
| API contract | OpenAPI 3.1 in `lib/api-spec/openapi.yaml` |
| Container | Node.js 24 slim, pnpm 10.26.1 |

### Main routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/healthz` | API health check |
| `GET` | `/api/tickets` | Latest saved tickets |
| `GET` | `/api/tickets/:id` | One ticket's transcript and recommendation |
| `POST` | `/api/tickets/analyze` | Demo-only WAV/MP3 upload simulation |
| `GET` | `/api/dashboard/summary` | Ticket totals and category counts |
| `GET` | `/api/rulebook` | Ordered classification rules for the UI |
| WebSocket | `/api/realtime` | Server-side proxy for live microphone audio |

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Compose supplies an internal one automatically. |
| `RESON8_API_KEY` | For live mode | Server-only Reson8 API key. Leave empty to disable realtime transcription. |
| `PORT` | Yes | API port; the Compose setup uses `5000`. |
| `WEB_DIST_DIR` | Container | Directory containing the built web app; Compose/Docker set this. |
| `CORS_ORIGIN` | No | Optional comma-separated browser origins for API CORS. |
| `BASE_PATH` | Vite build | Base path for the web app; the Docker build uses `/`. |

## Development commands

The repository uses Node.js 24 and pnpm 10.26.1. To install workspace
dependencies on a development machine:

```sh
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm install --frozen-lockfile
```

Useful checks:

```sh
pnpm --filter @workspace/api-server run test
pnpm run typecheck
```

The API test suite includes English and Spanish examples, overlap priority, and
the human-review fallback. The generated API client and Zod schemas come from
the OpenAPI file. After changing that file, regenerate them with:

```sh
pnpm --filter @workspace/api-spec run codegen
```

For a local one-command run, use Docker Compose above. The Replit development
workspace also provides a shared path-based proxy for the separate Vite and API
workflows; a plain local Vite server does not automatically provide that proxy.

## Project structure

```text
artifacts/
  acoustic-triage-agent/       React dashboard and ticket pages
  api-server/                  Express API and Reson8 WebSocket proxy
lib/
  api-spec/                    OpenAPI source contract
  api-client-react/            Generated React Query client
  api-zod/                     Generated Zod schemas
  db/                          PostgreSQL schema and Drizzle config
compose.yaml                   Local app + database setup
Dockerfile                     Multi-stage application image
```

## Security and privacy

- Keep `RESON8_API_KEY` in `.env` locally or Replit Secrets in Replit. Never
  place it in client-side code or commit it.
- The local Compose app is bound to `127.0.0.1`.
- This MVP does **not** include sign-in or user-specific ticket permissions.
  Do not expose it publicly or use it for real customer data until
  authentication and access control are added.
- The Reson8 key is only used by the API server. Raw live audio is streamed to
  Reson8 for transcription; Acoustic stores the ticket transcript, not the
  recording.
