import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from json_repair import repair_json
from langchain_core.callbacks.base import BaseCallbackHandler
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel, Field

from .prompts import SYSTEM_PROMPT

# ── Logging setup ──────────────────────────────────────────────────────────────
# Structured log lines make it easy to grep for JSON parse failures.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("fog-of-war.agent")

# ── Trace log file ─────────────────────────────────────────────────────────────
# Every completed analysis appends one JSON line to this file so the full agent
# reasoning is persisted on disk rather than displayed (and discarded) in the UI.
# Location: agent/logs/traces.jsonl  (created automatically on first write)
_LOGS_DIR = Path(__file__).resolve().parent.parent / "logs"
_TRACE_LOG = _LOGS_DIR / "traces.jsonl"


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively convert LangChain message objects (and any other non-JSON-
    serializable values) to plain strings so json.dumps never raises TypeError."""
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(v) for v in obj]
    # LangChain BaseMessage subclasses (ToolMessage, AIMessage, etc.) and any
    # other non-primitive — convert to their string representation.
    return str(obj)


def _write_trace_log(
    commander1: str,
    commander2: str,
    theater: str,
    trace: List[Dict[str, Any]],
    verdict_winner: Optional[str],
    parse_strategy: Optional[str],
) -> None:
    """Append a single JSONL record for this analysis to the trace log file."""
    _LOGS_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "commander1": commander1,
        "commander2": commander2,
        "theater": theater,
        "verdict_winner": verdict_winner,
        "parse_strategy": parse_strategy,
        "tool_calls": len(trace),
        "trace": _sanitize_for_json(trace),   # coerce ToolMessage → str
    }
    with _TRACE_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    logger.info("Trace log written → %s (%d tool calls)", _TRACE_LOG, len(trace))
from .tools import (
    calculate_combat_score,
    get_battle_context,
    get_civilization_stats,
    get_commander_profile,
    get_era_technology,
)


# Load .env from project root (one level up from /agent)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
logger.info("GOOGLE_API_KEY present: %s", bool(os.getenv("GOOGLE_API_KEY")))
logger.info("GROQ_API_KEY present:   %s", bool(os.getenv("GROQ_API_KEY")))
logger.info("OPENAI_API_KEY present: %s", bool(os.getenv("OPENAI_API_KEY")))

# ── In-memory diagnostics store (last analysis only) ───────────────────────────
# Exposed via GET /diagnostics so you can inspect raw LLM output without
# tailing logs — especially useful when tracking JSON parse failures.
_diagnostics: Dict[str, Any] = {
    "last_analysis_at": None,
    "commander1": None,
    "commander2": None,
    "raw_output": None,
    "raw_output_length": None,
    "parse_strategy": None,   # "direct" | "repaired" | "failed"
    "parse_error": None,
    "tool_calls": 0,
    "llm_provider": None,     # which provider actually responded
}

# ── Live trace — updated in real-time as the agent calls tools ─────────────────
# Cleared at the start of each /analyze call. The frontend polls
# GET /diagnostics/live-trace every second to show real agent activity
# on the loading screen instead of static fake messages.
# NOTE: single-user dev tool only — not safe for concurrent requests.
_live_trace: List[Dict[str, Any]] = []
_live_trace_complete: bool = False


class AnalyzeRequest(BaseModel):
    query: str = Field(..., description="Natural language battle analysis query.")
    commander1: str = Field(..., description="Name of the first commander.")
    commander2: str = Field(..., description="Name of the second commander.")


class ToolCallRecord(BaseModel):
    tool: str
    input: Any
    output: Any


class AnalyzeResponse(BaseModel):
    verdict: Dict[str, Any]
    thinking_trace: List[ToolCallRecord]


class ThinkingTraceHandler(BaseCallbackHandler):
    """Callback handler to capture tool usage for later inspection."""

    def __init__(self) -> None:
        self.trace: List[Dict[str, Any]] = []

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: Any,
        **kwargs: Any,
    ) -> None:
        entry = {
            "tool": serialized.get("name", "unknown_tool"),
            "input": input_str,
            "output": None,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        self.trace.append(entry)
        # Also write to the global live trace so the frontend can poll it.
        _live_trace.append(entry)
        logger.info("Tool call: %s | input: %s", entry["tool"], str(input_str)[:120])

    def on_tool_end(self, output: Any, **kwargs: Any) -> None:
        # Attach the output to the most recent tool call without an output.
        for record in reversed(self.trace):
            if record["output"] is None:
                record["output"] = output
                break


def _get_llm():
    """Build an LLM with an automatic provider fallback chain.

    All configured providers are chained in priority order using
    LangChain's .with_fallbacks(). If the primary provider raises any
    exception (rate-limit, quota, network) the next provider is tried
    automatically — no manual key toggling needed.

    Priority: Groq → OpenAI → Google Gemini
    """

    def _is_valid(key: str) -> bool:
        lowered = key.lower()
        return bool(key) and "your" not in lowered and "here" not in lowered

    candidates = []  # ordered list of (label, llm) tuples

    groq_api_key = os.getenv("GROQ_API_KEY") or ""
    if _is_valid(groq_api_key):
        try:
            from langchain_groq import ChatGroq
            model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            candidates.append(("Groq", ChatGroq(model=model_name, temperature=0)))
        except ImportError:
            logger.warning("GROQ_API_KEY set but langchain-groq is not installed — skipping")

    openai_api_key = os.getenv("OPENAI_API_KEY") or ""
    if _is_valid(openai_api_key):
        try:
            from langchain_openai import ChatOpenAI
            model_name = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
            candidates.append(("OpenAI", ChatOpenAI(model=model_name, temperature=0)))
        except ImportError:
            logger.warning("OPENAI_API_KEY set but langchain-openai is not installed — skipping")

    google_api_key = os.getenv("GOOGLE_API_KEY") or ""
    if _is_valid(google_api_key):
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            model_name = os.getenv("GOOGLE_MODEL", "gemini-2.0-flash")
            candidates.append(("Google Gemini", ChatGoogleGenerativeAI(model=model_name, temperature=0)))
        except ImportError:
            logger.warning("GOOGLE_API_KEY set but langchain-google-genai is not installed — skipping")

    if not candidates:
        raise RuntimeError(
            "No LLM configured. Provide at least one of: "
            "GOOGLE_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY."
        )

    labels = [label for label, _ in candidates]
    llms = [llm for _, llm in candidates]

    if len(llms) == 1:
        logger.info("LLM provider: %s (no fallback configured)", labels[0])
        return llms[0]

    # Chain primary with automatic fallbacks — if primary raises any
    # exception (quota, rate-limit, network) the next provider is tried.
    logger.info(
        "LLM provider chain: %s → (fallbacks: %s)",
        labels[0],
        " → ".join(labels[1:]),
    )
    return llms[0].with_fallbacks(llms[1:])


def _build_graph():
    llm = _get_llm()

    tools = [
        get_commander_profile,
        get_battle_context,
        get_era_technology,
        get_civilization_stats,
        calculate_combat_score,
    ]

    graph = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SystemMessage(content=SYSTEM_PROMPT),
    )
    return graph


app = FastAPI(
    title="Historical Battle Analyzer - Agent",
    description=(
        "LangChain-based backend for orchestrating AI analysis of historical battles. "
        "Coordinates with an MCP server to fetch structured data and compute "
        "a final, structured verdict."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

_graph = None


def get_graph():
    global _graph  # noqa: PLW0603
    if _graph is None:
        _graph = _build_graph()
    return _graph


@app.get("/health")
async def health() -> Dict[str, Any]:
    """
    Lightweight healthcheck endpoint for the agent service.

    Returns basic service metadata and indicates whether the
    underlying LLM configuration appears valid.
    """

    llm_ready = True
    error_message: Optional[str] = None

    try:
        # Do a lightweight construction check without forcing global init.
        _ = _get_llm()
    except Exception as exc:  # noqa: BLE001
        llm_ready = False
        error_message = str(exc)

    return {
        "status": "ok",
        "service": "agent",
        "llm_ready": llm_ready,
        "error": error_message,
    }


@app.get("/suggestions")
async def get_suggestions() -> Dict[str, Any]:
    """
    Generate fresh, AI-produced battle scenario suggestions.

    Calls the LLM directly (no ReAct agent loop) for speed.
    Returns a JSON object with two arrays:
      - theaters: 8 diverse battle locations
      - forces:   10 diverse commanders / armies / factions
    Every call produces a different set so the briefing screen
    feels fresh on each new analysis.
    """
    try:
        llm = _get_llm()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"LLM not available: {exc}") from exc

    prompt = (
        "Generate creative battle scenario suggestions for a tactical war-game. "
        "Return ONLY a valid JSON object — no markdown fences, no preamble, no commentary.\n\n"
        "{\n"
        '  "theaters": [\n'
        "    8 diverse battle locations — mix of famous historical battlefields, "
        "exotic or remote locations, mythological / legendary settings, and at least "
        "one genuinely surprising or absurd venue\n"
        "  ],\n"
        '  "forces": [\n'
        "    10 diverse combatants — mix of historical commanders, ancient armies, "
        "fictional or mythological factions, and at least two unconventional wildcard "
        "entries (e.g. a concept, creature army, or pop-culture force)\n"
        "  ]\n"
        "}\n\n"
        "Do NOT include the most clichéd pairings. Be creative and varied."
    )

    try:
        # Run synchronous LLM call off the event loop thread.
        response = await asyncio.to_thread(lambda: llm.invoke(prompt))
        raw = response.content if hasattr(response, "content") else str(response)

        # Robustly extract the JSON object from the raw response.
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw = raw[start : end + 1]

        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"LLM returned non-JSON suggestions: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate suggestions: {exc}",
        ) from exc


@app.get("/diagnostics/live-trace")
async def live_trace() -> Dict[str, Any]:
    """
    Returns the tool calls made so far in the current (or most recent) analysis.

    The frontend polls this every second during the loading screen to display
    real agent activity — which Wikipedia endpoints were queried, what the
    combat scorer received, etc. — instead of static fake status messages.

    Fields:
      - trace: list of { tool, input, ts } objects in call order
      - complete: true once the /analyze request has finished
    """
    return {"trace": _live_trace, "complete": _live_trace_complete}


@app.get("/diagnostics")
async def diagnostics() -> Dict[str, Any]:
    """
    Returns metadata about the most recent /analyze call.

    Useful for debugging JSON parse failures without tailing logs:
      - raw_output: the exact string the LLM returned
      - parse_strategy: "direct" | "repaired" | "failed"
      - parse_error: the exception message if parsing failed
      - tool_calls: how many MCP tools the agent invoked

    This endpoint is intentionally unauthenticated for development.
    Remove or gate it behind an API key before any public deployment.
    """
    return _diagnostics


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze a hypothetical battle between two commanders.

    This endpoint orchestrates a LangChain ReAct-style agent that
    queries the MCP server for commander profiles, battles, era
    technology, and civilization context, then calls the combat
    scoring endpoint and synthesizes a structured verdict.
    """

    global _live_trace, _live_trace_complete  # noqa: PLW0603
    _live_trace = []
    _live_trace_complete = False

    graph = get_graph()
    callback = ThinkingTraceHandler()

    # Fold commander names into the user query so the graph sees
    # the full scenario description in a single message.
    full_query = (
        "Battle analysis query:\n"
        f"{request.query}\n\n"
        f"Commander 1: {request.commander1}\n"
        f"Commander 2: {request.commander2}\n\n"
        "Using the available tools, determine who would be more likely "
        "to prevail. Remember to always call `calculate_combat_score` "
        "before your final verdict and respond ONLY with the final "
        "JSON object."
    )

    try:
        # Run the (synchronous) graph in a thread to avoid blocking the event loop.
        result = await asyncio.to_thread(
            lambda: graph.invoke(
                {"messages": [("user", full_query)]},
                config={"callbacks": [callback]},
            )
        )
    except Exception as exc:  # noqa: BLE001
        exc_str = str(exc)
        # Surface rate-limit failures with a clear, actionable message rather
        # than the raw LangChain exception which is hard to read in the UI.
        if "429" in exc_str or "RESOURCE_EXHAUSTED" in exc_str or "rate_limit" in exc_str.lower():
            detail = (
                "All LLM providers are currently rate-limited. "
                "Wait a minute and try again, or add a new API key."
            )
        else:
            detail = f"Agent error: {exc_str[:300]}"
        raise HTTPException(status_code=500, detail=detail) from exc

    try:
        # LangGraph ReAct agent returns a state dict with "messages".
        final_message = result["messages"][-1]
        raw_output = final_message.content
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected graph output format: {exc}",
        ) from exc

    _live_trace_complete = True  # signal to polling frontend that agent is done

    # ── Update diagnostics with raw output ────────────────────────────────────
    _diagnostics.update({
        "last_analysis_at": datetime.now(timezone.utc).isoformat(),
        "commander1": request.commander1,
        "commander2": request.commander2,
        "raw_output": raw_output,
        "raw_output_length": len(raw_output),
        "parse_strategy": None,
        "parse_error": None,
        "tool_calls": len(callback.trace),
    })
    logger.info(
        "Agent finished | commanders: %s vs %s | raw_output length: %d chars | tools called: %d",
        request.commander1,
        request.commander2,
        len(raw_output),
        len(callback.trace),
    )
    logger.debug("Raw LLM output:\n%s", raw_output)

    # ── JSON extraction with three-tier fallback ───────────────────────────────
    # Tier 1 — Direct parse: works when the LLM is well-behaved.
    # Tier 2 — json-repair: fixes unescaped newlines inside strings, trailing
    #           commas, missing quotes, and other common LLM generation errors.
    #           This is the permanent fix for the "everything in narrative" bug.
    # Tier 3 — Fallback struct: keeps the API contract intact while surfacing
    #           the raw output in the narrative field for manual inspection.
    verdict = None
    parse_error = None

    # Strip markdown fences and isolate the JSON object first.
    cleaned = raw_output.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned, flags=re.MULTILINE).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start : end + 1]

    # Tier 1: standard json.loads
    try:
        verdict = json.loads(cleaned)
        _diagnostics["parse_strategy"] = "direct"
        logger.info("JSON parse strategy: DIRECT (clean output)")
    except json.JSONDecodeError as exc:
        parse_error = str(exc)
        logger.warning("Direct JSON parse failed: %s — trying json-repair", exc)

    # Tier 2: json-repair (handles unescaped newlines, trailing commas, etc.)
    if verdict is None:
        try:
            repaired = repair_json(cleaned)
            verdict = json.loads(repaired)
            _diagnostics["parse_strategy"] = "repaired"
            logger.info("JSON parse strategy: REPAIRED (json-repair fixed malformed output)")
        except Exception as exc:  # noqa: BLE001
            parse_error = str(exc)
            logger.error(
                "json-repair also failed: %s\nFirst 500 chars of raw output:\n%s",
                exc,
                raw_output[:500],
            )

    # Tier 3: fallback — surface raw output so the developer can inspect it
    if verdict is None:
        _diagnostics["parse_strategy"] = "failed"
        _diagnostics["parse_error"] = parse_error
        logger.error(
            "All JSON extraction strategies failed. "
            "Check GET /diagnostics for the full raw output."
        )
        verdict = {
            "winner": None,
            "confidence_percentage": None,
            "commander1_score": None,
            "commander2_score": None,
            "initial_deployment": {
                "description": "JSON parse failed — see /diagnostics for raw output.",
                "commander1_formation": "",
                "commander2_formation": "",
                "terrain_advantage": "neutral",
            },
            "score_breakdown": {},
            "narrative": f"[PARSE ERROR — json-repair could not fix this output]\n\n{raw_output}",
            "aftermath": {
                "description": "",
                "commander1_casualties": "Unknown",
                "commander2_casualties": "Unknown",
                "strategic_consequence": "",
                "historical_significance": "",
            },
            "fun_fact": "",
            "_parse_error": parse_error,
        }

    # ── Write full reasoning trace to disk ────────────────────────────────────
    # The frontend no longer displays this; it lives in agent/logs/traces.jsonl
    # where it can be inspected, grepped, or diffed at any time.
    _write_trace_log(
        commander1=request.commander1,
        commander2=request.commander2,
        theater=request.query,          # full query contains the theater context
        trace=callback.trace,
        verdict_winner=verdict.get("winner") if isinstance(verdict, dict) else None,
        parse_strategy=_diagnostics.get("parse_strategy"),
    )

    trace_models = [ToolCallRecord(**record) for record in callback.trace]

    return AnalyzeResponse(verdict=verdict, thinking_trace=trace_models)
