# Fog of War — Tactical Analysis System

A historical battle analyzer that pits any two commanders, armies, or factions against each other at any location — real, fictional, or completely absurd. Powered by a LangChain ReAct agent, a Wikipedia MCP server, and a CRT-terminal React frontend.

---

## Architecture

```
┌─────────────────────────────────────┐
│  Frontend  React + Vite + Tailwind  │  :5173
│  CRT terminal aesthetic             │
└────────────────┬────────────────────┘
                 │  POST /analyze
                 │  GET  /health  /suggestions
                 ▼
┌─────────────────────────────────────┐
│  Agent  LangChain ReAct + FastAPI   │  :8000
│  • Groq → OpenAI → Gemini fallback  │
│  • ThinkingTraceHandler callbacks   │
│  • json-repair for malformed output │
└────────────────┬────────────────────┘
                 │  GET/POST  (X-API-Key header)
                 ▼
┌─────────────────────────────────────┐
│  MCP Server  FastAPI + Wikipedia    │  :8001
│  • /commander  /battle  /era-tech   │
│  • /civilization  /combat-score     │
└────────────────┬────────────────────┘
                 │  HTTPS
                 ▼
         Wikipedia REST API
```

**Request flow:**
1. Browser submits theater + two forces to the Agent
2. Agent runs a ReAct loop — tool calls fetch Wikipedia data for both sides
3. `calculate_combat_score` scores each force across 6 weighted dimensions
4. Agent synthesises a structured JSON verdict (winner, scores, narrative, aftermath)
5. Frontend animates the result across 4 sections: initial contact → stats → simulation → aftermath

---

## Quick Start

### 1. Copy the environment file

```bash
cp .env.example .env
```

Open `.env` and fill in at least one LLM API key. Groq is recommended — it's free and fast.

| Provider | Env var | Free tier | Link |
|----------|---------|-----------|------|
| **Groq** *(recommended)* | `GROQ_API_KEY` | ✅ | [console.groq.com](https://console.groq.com) |
| OpenAI | `OPENAI_API_KEY` | ❌ | [platform.openai.com](https://platform.openai.com/api-keys) |
| Google Gemini | `GOOGLE_API_KEY` | ✅ (limited quota) | [aistudio.google.com](https://aistudio.google.com/app/apikey) |

The agent tries providers in the order above and falls back automatically when one is rate-limited.

### 2a. Run with Docker (recommended)

```bash
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173).

### 2b. Run manually (3 terminals)

**Terminal 1 — MCP Server**
```bash
cd mcp-server
pip install -e .
python -m uvicorn app.main:app --port 8001
```

**Terminal 2 — Agent**
```bash
cd agent
pip install -e .
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 3 — Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## Project Structure

```
fog-of-war/
├── frontend/
│   └── src/App.tsx          # All UI logic — briefing, gathering, assessment
├── agent/
│   └── app/
│       ├── main.py          # FastAPI app, LangGraph ReAct agent, LLM fallback chain
│       ├── tools.py         # LangChain tools that call the MCP server
│       └── prompts.py       # System prompt for the ReAct agent
├── mcp-server/
│   └── app/main.py          # Wikipedia wrapper + weighted combat scoring formula
├── docker-compose.yml
├── .env.example             # All supported environment variables, with comments
└── README.md
```

---

## Security

### API key handling

- All provider keys live only in `.env` (gitignored). They are never logged, never sent to the frontend, and never committed.
- `.env.example` ships with placeholder values only.
- To rotate a key: update `.env` and restart the affected service — no code changes needed.

### MCP server authentication

The MCP server is an internal service — only the Agent should call it. Protect it with a shared secret:

1. Generate a strong value:
   ```bash
   openssl rand -hex 32
   ```
2. Add it to `.env`:
   ```
   MCP_API_KEY=<your-secret>
   ```
3. Restart both services. The Agent sends `X-API-Key: <secret>` on every request; the MCP server rejects anything that doesn't match.

When `MCP_API_KEY` is empty both services log a warning and run in unauthenticated dev-mode — acceptable locally, **not** for deployment.

### Diagnostics endpoints

`GET /diagnostics` and `GET /diagnostics/live-trace` expose raw LLM output and analysis metadata. Gate them before deploying:

```
DIAGNOSTICS_API_KEY=<another-secret>
```

When set, requests require an `X-API-Key` header. When empty, the endpoints are open (dev-mode).

---

## Troubleshooting

### "SYSTEM DEACTIVATED — ALL LLM PROVIDERS CURRENTLY RATE-LIMITED"

The briefing page shows this indicator when a recent request returned HTTP 429.

- **Groq free tier**: ~30 req/min, resets automatically. Wait ~60 s or add a second provider.
- **Gemini free tier**: very low daily quota — add a Groq key so Gemini is only used as last-resort fallback.
- The status clears automatically 2 minutes after the last 429.

### "TRANSMISSION FAILED — Failed to fetch"

The frontend cannot reach the Agent at `http://localhost:8000`.

1. Verify the Agent is running: `curl http://localhost:8000/health`
2. Check for Python import errors in the Agent terminal output.
3. Confirm `MCP_SERVER_URL` points to the running MCP server (default: `http://localhost:8001`).

### 401 Unauthorized from the MCP server

`MCP_API_KEY` is set in one service but not the other, or the values don't match. Make sure the same value is present in `.env` for both services and restart both.

### 422 Unprocessable Entity on `/combat-score`

The LLM sent a payload that doesn't match the MCP server's `CombatScoreRequest` schema. Check `GET /diagnostics` (with your `DIAGNOSTICS_API_KEY` if set) for the raw LLM output and the `parse_strategy` field.

### Everything appears in the "Battle Simulation" section

The LLM returned malformed JSON (literal newlines inside string values). The three-tier extractor — direct parse → `json-repair` → fallback struct — should fix this silently. If it persists, check `agent/logs/traces.jsonl` and switch to Groq (`llama-3.3-70b-versatile`), which produces cleaner JSON output than Gemini.

---

## Agent Reasoning Logs

After every analysis the full tool-call trace is appended to `agent/logs/traces.jsonl` (gitignored). Each line is a self-contained JSON record:

```json
{
  "timestamp": "2025-...",
  "commander1": "Julius Caesar",
  "commander2": "Genghis Khan",
  "theater": "...",
  "verdict_winner": "Genghis Khan",
  "parse_strategy": "direct",
  "tool_calls": 9,
  "trace": [ { "tool": "get_commander_profile", "input": "...", "output": "..." }, "..." ]
}
```

Inspect with `jq` or any JSON viewer to review exactly what the agent looked up and why.
