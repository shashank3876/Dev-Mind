# DevMind

DevMind is an AI-powered developer assistant that combines a streaming chat interface, retrieval-augmented generation (RAG), and automated GitHub pull request reviews. It is built as a polyglot monorepo: a Go gateway for webhooks, a Python FastAPI backend for LLM orchestration, and a React frontend for the chat experience.

## Features

- **Streaming chat** — Real-time responses over Server-Sent Events (SSE) with support for Claude, Gemini, and OpenAI
- **RAG context** — Ingest documents into Qdrant and retrieve relevant chunks during chat
- **Conversation memory** — Per-user chat history stored in SQLite
- **Automated PR reviews** — GitHub webhooks trigger background workers that fetch diffs, run LLM reviews, and post comments
- **Multi-provider LLM routing** — Switch providers via environment config or per-request selection

## Architecture

```mermaid
flowchart LR
  subgraph frontend [Frontend]
    UI[React Chat UI]
  end

  subgraph ai [AI Backend]
    API[FastAPI]
    RAG[Qdrant RAG]
    MEM[SQLite Memory]
    LLM[LLM Providers]
  end

  subgraph automation [Automation Pipeline]
    GH[GitHub Webhooks]
    GW[Go Gateway]
    REDIS[(Redis)]
    WRK[Python Worker]
  end

  
  
  UI -->|POST /chat SSE| API
  API --> RAG
  API --> MEM
  API --> LLM
  GH --> GW --> REDIS --> WRK
  WRK --> LLM
  WRK -->|Post comment| GH
```

### How it works

1. **Chat flow** — The frontend sends messages to the AI backend. The backend loads recent history from SQLite, optionally retrieves context from Qdrant, and streams tokens from the selected LLM provider.
2. **PR review flow** — GitHub sends `pull_request` or `push` events to the Go gateway. The gateway verifies the webhook signature, enqueues a job in Redis, and the Python worker picks it up, fetches the PR diff, generates a review, and posts it as a GitHub comment.

## Project structure

```
Dev-Mind/
├── main.go                 # Go gateway entry point
├── handlers/               # GitHub webhook handler
├── middleware/             # Webhook signature verification
├── queue/                  # Redis job queue
├── models/                 # Shared Go structs
├── ai-backend/             # Python FastAPI service + worker
│   ├── main.py             # API server
│   ├── worker.py           # Background PR review worker
│   ├── routes/             # chat, ingest, health
│   └── services/           # LLM, RAG, memory, GitHub
├── artifacts/
│   ├── frontend/           # React + Vite chat UI
│   ├── api-server/         # Express API (health checks)
│   └── mockup-sandbox/     # UI sandbox
├── lib/                    # Shared TypeScript packages
│   ├── api-spec/           # OpenAPI specification
│   ├── api-zod/            # Generated Zod schemas
│   ├── api-client-react/   # Generated React Query client
│   └── db/                 # Drizzle ORM schema
└── scripts/                # Workspace utility scripts
```

## Prerequisites

- [Go](https://go.dev/) 1.22+
- [Python](https://www.python.org/) 3.11+
- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- [Redis](https://redis.io/) (job queue)
- [Qdrant](https://qdrant.tech/) (vector store for RAG)

## Getting started

### 1. Clone and install dependencies

```bash
git clone <repository-url>
cd Dev-Mind

# Node.js workspace
pnpm install

# Python backend
cd ai-backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Go gateway
go mod download
```

### 2. Configure environment

Copy the example env files and fill in your values:

```bash
cp .env.example .env
```

**Root / gateway** (`.env`):

| Variable | Description |
|---|---|
| `GITHUB_WEBHOOK_SECRET` | Secret used to verify GitHub webhook signatures |
| `REDIS_URL` | Redis address (e.g. `localhost:6379`) |
| `PORT` | Gateway port (default `8080`) |

**AI backend** (`ai-backend/.env`):

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude) |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `DEFAULT_LLM_PROVIDER` | Default provider: `claude`, `gemini`, or `openai` |
| `REDIS_URL` | Redis URL (e.g. `redis://localhost:6379`) |
| `QDRANT_URL` | Qdrant server URL (e.g. `http://localhost:6333`) |
| `QDRANT_API_KEY` | Qdrant API key (optional for local dev) |
| `GITHUB_TOKEN` | GitHub PAT for fetching diffs and posting PR comments |
| `PORT` | AI backend port (default `8001`) |

**Frontend** — set `VITE_API_URL` to point at the AI backend (e.g. `http://localhost:8001`).

### 3. Start infrastructure

Make sure Redis and Qdrant are running locally (or update the URLs in your env files to point at hosted instances).

```bash
# Example with Docker
docker run -d --name redis -p 6379:6379 redis:7
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
```

### 4. Run the services

Open separate terminals for each service:

```bash
# Terminal 1 — Go gateway (webhooks)
go run main.go

# Terminal 2 — AI backend API
cd ai-backend
source .venv/bin/activate
uvicorn main:app --reload --port 8001

# Terminal 3 — PR review worker
cd ai-backend
source .venv/bin/activate
python worker.py

# Terminal 4 — Frontend
cd artifacts/frontend
PORT=5173 BASE_PATH=/ VITE_API_URL=http://localhost:8001 pnpm dev
```

## API reference

### AI Backend (FastAPI)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/providers` | List available LLM providers |
| `POST` | `/chat` | Stream a chat response (SSE) |
| `POST` | `/chat/clear` | Clear chat history for a user |
| `POST` | `/ingest` | Index text into Qdrant for RAG |

**Chat request example:**

```bash
curl -N -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain React Server Components", "user_id": "user-1", "provider": "claude"}'
```

**Ingest example:**

```bash
curl -X POST http://localhost:8001/ingest \
  -H "Content-Type: application/json" \
  -d '{"text": "Your documentation or code context here", "metadata": {"source": "readme"}}'
```

### Go Gateway

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/webhook/github` | GitHub webhook endpoint (signature verified) |

Configure your GitHub repository webhook to point at `https://<your-host>/webhook/github` with events `pull_request` and `push`.

## Development

### Type checking

```bash
pnpm run typecheck
```

### Build

```bash
pnpm run build
```

### Workspace packages

The TypeScript packages under `lib/` are generated and shared across artifacts:

- `api-spec` — OpenAPI source of truth
- `api-zod` — Zod schemas generated from the spec
- `api-client-react` — React Query hooks generated from the spec
- `db` — Drizzle ORM database schema

## Tech stack

| Layer | Technologies |
|---|---|
| Gateway | Go, chi, Redis |
| AI Backend | Python, FastAPI, Anthropic/OpenAI/Gemini SDKs, Qdrant, sentence-transformers |
| Frontend | React 19, Vite, Tailwind CSS, Radix UI |
| API Server | Express 5, Drizzle ORM, Pino |
| Tooling | pnpm workspaces, TypeScript, esbuild |

## License

MIT
