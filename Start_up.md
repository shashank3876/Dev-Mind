1. Install
pnpm install
cd ai-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
go mod download

2. Env
cp .env.example .env
Add at least one LLM key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY).
Set DATABASE_URL, SESSION_SECRET, OAuth client IDs, and for Activity linking:
AI_BACKEND_SECRET, INTERNAL_API_SECRET, API_SERVER_URL, AI_BACKEND_URL.
Set REDIS_URL / RABBITMQ_URL and QDRANT_URL as needed.

3. Infra
docker run -d --name redis -p 6379:6379 redis:7
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
# After schema changes:
cd lib/db && pnpm run push

4. Run services (separate terminals, Node 22+)
# Express api-server (auth, chat proxy, activity) — required
nvm use 22
cd artifacts/api-server && pnpm run dev
# AI backend
cd ai-backend && source .venv/bin/activate
uvicorn main:app --reload --port 8001
# Frontend (proxies /api → api-server)
cd artifacts/frontend && pnpm dev
# Optional: GitHub webhooks + worker (INTERNAL_API_SECRET links PR reviews to Activity)
go run main.go
cd ai-backend && source .venv/bin/activate && python worker.py

Chat / Activity / DNA: http://localhost:5173
API server: http://localhost:3001
AI API: http://localhost:8001

Sign in with GitHub once to backfill encrypted token + login for /activity and /dna.
Developer DNA (`/dna`) rebuilds from public pushes/PRs + DevMind reviews; webhook PR activity marks the profile stale and triggers an async rebuild.
