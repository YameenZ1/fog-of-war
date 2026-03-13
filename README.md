# Fog of War

A historical battle analyzer that pits any two commanders, armies, or factions against each other at any location — real, fictional, or completely absurd. Powered by a LangChain ReAct agent, a Wikipedia MCP server, and a terminal-aesthetic React frontend.

---

## Architecture

```
Frontend  (React + Vite)       :5173
    ↓  POST /analyze
Agent     (LangChain + FastAPI) :8000   ← calls Groq / Gemini / OpenAI
    ↓  GET/POST
MCP Server (FastAPI + Wikipedia) :8001
    ↓  HTTPS
Wikipedia REST API
```

---

## Quick Start

### 1. Get an LLM API key

The agent supports three providers — only one is needed:

| Provider | Key name | Get one |
|----------|----------|---------|
| Groq (recommended, free) | `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| Google Gemini | `GOOGLE_API_KEY` | [aistudio.google.com](https://aistudio.google.com) |
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |

### 2. Set up your environment

```bash
cp .env.example .env
# then open .env and paste your key
```

### 3. Run with Docker (recommended)

```bash
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173).

### 4. Or run manually (3 terminals)

```bash
# Terminal 1 — MCP Server
cd mcp-server && pip install -e . && python -m uvicorn app.main:app --port 8001

# Terminal 2 — Agent
cd agent && pip install -e . && python -m uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend && npm install && npm run dev
```

---

## Project Structure

```
fog-of-war/
├── frontend/          # React + Vite + Tailwind UI
├── agent/             # LangChain ReAct agent + FastAPI
├── mcp-server/        # Wikipedia API wrapper + combat scorer
├── docker-compose.yml
└── .env.example
```

---

## How It Works

1. You enter a theater, Force Alpha, and Force Bravo
2. The agent runs a ReAct loop — calling Wikipedia endpoints to research both sides
3. A weighted combat formula scores each force across 6 dimensions
4. Results are returned as a structured 4-section report: initial contact → pre-battle stats → battle simulation → aftermath
