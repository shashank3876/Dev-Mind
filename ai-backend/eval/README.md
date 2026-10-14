# RAG evaluation set

- `rag_eval_dataset.json` — 25 corpus docs + 25 gold questions (`doc_id` + answer keywords)
- `last_results.json` — latest hybrid vs vector-only run (checked in for README metrics)

```bash
cd ai-backend && source .venv/bin/activate
python scripts/eval_rag.py --out eval/last_results.json
```

Requires Qdrant at `QDRANT_URL` (default `http://localhost:6333`).
