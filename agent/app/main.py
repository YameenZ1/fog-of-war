import asyncio
import json
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from langchain.agents import AgentExecutor, create_react_agent
from langchain.callbacks.base import BaseCallbackHandler
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from .prompts import SYSTEM_PROMPT
from .tools import (
    calculate_combat_score,
    get_battle_context,
    get_civilization_stats,
    get_commander_profile,
    get_era_technology,
)


load_dotenv()


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

    openai_api_key = os.getenv("OPENAI_API_KEY")
    google_api_key = os.getenv("GOOGLE_API_KEY")

    if openai_api_key:
        try:
            from langchain_openai import ChatOpenAI
        except ImportError as exc:  # noqa: BLE001
            raise RuntimeError(
                "OPENAI_API_KEY is set but langchain-openai is not installed."
            ) from exc

        model_name = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        return ChatOpenAI(model=model_name, temperature=0)

    if google_api_key:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as exc:  # noqa: BLE001
            raise RuntimeError(
                "GOOGLE_API_KEY is set but langchain-google-genai is not installed."
            ) from exc

        model_name = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")
        return ChatGoogleGenerativeAI(model=model_name, temperature=0)

    raise RuntimeError(
        "No supported LLM configured. "
        "Set either OPENAI_API_KEY or GOOGLE_API_KEY in the environment."
    )


def _build_agent_executor() -> AgentExecutor:
    llm = _get_llm()

    tools = [
        get_commander_profile,
        get_battle_context,
        get_era_technology,
        get_civilization_stats,
        calculate_combat_score,
    ]

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            (
                "human",
                (
                    "Battle analysis query:\n{query}\n\n"
                    "Commander 1: {commander1}\n"
                    "Commander 2: {commander2}\n\n"
                    "Using the available tools, determine who would be more "
                    "likely to prevail. Remember to always call "
                    "`calculate_combat_score` before your final verdict and "
                    "respond ONLY with the final JSON object."
                ),
            ),
        ]
    )

    agent = create_react_agent(llm=llm, tools=tools, prompt=prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
    return executor


app = FastAPI(
    title="Historical Battle Analyzer - Agent",
    description=(
        "LangChain-based backend for orchestrating AI analysis of historical battles. "
        "Coordinates with an MCP server to fetch structured data and compute "
        "a final, structured verdict."
    ),
    version="0.1.0",
)

_agent_executor: Optional[AgentExecutor] = None


def get_agent_executor() -> AgentExecutor:
    global _agent_executor  # noqa: PLW0603
    if _agent_executor is None:
        _agent_executor = _build_agent_executor()
    return _agent_executor


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


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze a hypothetical battle between two commanders.

    This endpoint orchestrates a LangChain ReAct-style agent that
    queries the MCP server for commander profiles, battles, era
    technology, and civilization context, then calls the combat
    scoring endpoint and synthesizes a structured verdict.
    """

    executor = get_agent_executor()
    callback = ThinkingTraceHandler()

    inputs = {
        "query": request.query,
        "commander1": request.commander1,
        "commander2": request.commander2,
    }

    try:
        # Run the (synchronous) agent in a thread to avoid blocking the event loop.
        result = await asyncio.to_thread(
            executor.invoke,
            inputs,
            {"callbacks": [callback]},
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Error while running analysis agent: {exc}",
        ) from exc

    raw_output = result.get("output")
    if raw_output is None:
        raise HTTPException(
            status_code=500,
            detail="Agent did not return any output.",
        )

    try:
        verdict = json.loads(raw_output)
    except json.JSONDecodeError:
        # If the model responded with non-JSON text, wrap it so the
        # API contract is still respected.
        verdict = {
            "winner": None,
            "confidence_percentage": None,
            "commander1_score": None,
            "commander2_score": None,
            "score_breakdown": {},
            "narrative": str(raw_output),
            "fun_fact": "",
        }

    trace_models = [ToolCallRecord(**record) for record in callback.trace]

    return AnalyzeResponse(verdict=verdict, thinking_trace=trace_models)
