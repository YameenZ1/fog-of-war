import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.callbacks.base import BaseCallbackHandler
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent
from pydantic import BaseModel, Field

from .prompts import SYSTEM_PROMPT
from .tools import (
    calculate_combat_score,
    get_battle_context,
    get_civilization_stats,
    get_commander_profile,
    get_era_technology,
)


# Load .env from project root (one level up from /agent)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
print("GOOGLE_API_KEY found:", bool(os.getenv("GOOGLE_API_KEY")))


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
        self.trace.append(
            {
                "tool": serialized.get("name", "unknown_tool"),
                "input": input_str,
                "output": None,
            }
        )

    def on_tool_end(self, output: Any, **kwargs: Any) -> None:
        # Attach the output to the most recent tool call without an output.
        for record in reversed(self.trace):
            if record["output"] is None:
                record["output"] = output
                break


def _get_llm():
    """Instantiate the underlying chat model based on available environment variables."""

    openai_api_key = os.getenv("OPENAI_API_KEY") or ""
    google_api_key = os.getenv("GOOGLE_API_KEY") or ""
    groq_api_key = os.getenv("GROQ_API_KEY") or ""

    def _is_valid(key: str) -> bool:
        lowered = key.lower()
        return bool(key) and "your" not in lowered and "here" not in lowered

    openai_valid = _is_valid(openai_api_key)
    google_valid = _is_valid(google_api_key)
    groq_valid = _is_valid(groq_api_key)

    # Prefer a valid Google Generative AI key if available.
    if google_valid:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as exc:  # noqa: BLE001
            raise RuntimeError(
                "GOOGLE_API_KEY is set but langchain-google-genai is not installed."
            ) from exc

        model_name = os.getenv("GOOGLE_MODEL", "gemini-2.0-flash")
        return ChatGoogleGenerativeAI(model=model_name, temperature=0)

    # Next, prefer a valid Groq key if available.
    if groq_valid:
        try:
            from langchain_groq import ChatGroq
        except ImportError as exc:  # noqa: BLE001
            raise RuntimeError(
                "GROQ_API_KEY is set but langchain-groq is not installed."
            ) from exc

        model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        return ChatGroq(model=model_name, temperature=0)

    if openai_valid:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as exc:  # noqa: BLE001
            raise RuntimeError(
                "OPENAI_API_KEY is set but langchain-openai is not installed."
            ) from exc

        model_name = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        return ChatOpenAI(model=model_name, temperature=0)

    raise RuntimeError(
        "No supported LLM configured. "
        "Provide a valid GOOGLE_API_KEY (preferred) or OPENAI_API_KEY in the environment. "
        "Keys must not be placeholder values containing 'your' or 'here'."
    )


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


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze a hypothetical battle between two commanders.

    This endpoint orchestrates a LangChain ReAct-style agent that
    queries the MCP server for commander profiles, battles, era
    technology, and civilization context, then calls the combat
    scoring endpoint and synthesizes a structured verdict.
    """

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
        raise HTTPException(
            status_code=500,
            detail=f"Error while running analysis agent: {exc}",
        ) from exc

    try:
        # LangGraph ReAct agent returns a state dict with "messages".
        final_message = result["messages"][-1]
        raw_output = final_message.content
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected graph output format: {exc}",
        ) from exc

    try:
        # Strip markdown code fences the model sometimes wraps JSON in,
        # then find the first '{' and last '}' to isolate the JSON object
        # even if the model adds preamble or trailing commentary.
        cleaned = raw_output.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```\s*$", "", cleaned, flags=re.MULTILINE).strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start : end + 1]
        verdict = json.loads(cleaned)
    except json.JSONDecodeError:
        # If the model responded with non-JSON text, wrap it so the
        # API contract is still respected.
        verdict = {
            "winner": None,
            "confidence_percentage": None,
            "commander1_score": None,
            "commander2_score": None,
            "initial_deployment": {
                "description": "",
                "commander1_formation": "",
                "commander2_formation": "",
                "terrain_advantage": "neutral",
            },
            "score_breakdown": {},
            "narrative": str(raw_output),
            "aftermath": {
                "description": "",
                "commander1_casualties": "Unknown",
                "commander2_casualties": "Unknown",
                "strategic_consequence": "",
                "historical_significance": "",
            },
            "fun_fact": "",
        }

    trace_models = [ToolCallRecord(**record) for record in callback.trace]

    return AnalyzeResponse(verdict=verdict, thinking_trace=trace_models)
