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
Add at least one LLM key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY) in ai-backend/.env. Set REDIS_URL and QDRANT_URL as needed.

3. Infra
docker run -d --name redis -p 6379:6379 redis:7
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
4. Run services (separate terminals)
# AI chat API (required for UI)
cd ai-backend && source .venv/bin/activate
uvicorn main:app --reload --port 8001
# Frontend
cd artifacts/frontend
PORT=5173 BASE_PATH=/ VITE_API_URL=http://localhost:8001 pnpm dev
# Optional: GitHub webhooks
go run main.go
# Optional: PR review worker
cd ai-backend && source .venv/bin/activate && python worker.py
Chat UI: http://localhost:5173
AI API: http://localhost:8001

  

# from repo root, Node 22+
nvm use 22
cd artifacts/api-server
pnpm run dev
That listens on http://localhost:3001. Your frontend should already proxy there via VITE_API_PROXY_TARGET (default)