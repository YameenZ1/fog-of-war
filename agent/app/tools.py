import json
import os
from typing import Any, Dict

import httpx
from langchain.tools import tool


MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8001")

# Shared secret sent to the MCP server as X-API-Key on every request.
# Must match MCP_API_KEY in the MCP server's environment.
# If not set, the header is omitted (works when MCP server runs in dev-mode).
_MCP_API_KEY: str = os.getenv("MCP_API_KEY", "")


def _build_client() -> httpx.Client:
    """Build an httpx client pre-configured with the MCP base URL and auth header."""
    headers: Dict[str, str] = {}
    if _MCP_API_KEY:
        headers["X-API-Key"] = _MCP_API_KEY
    return httpx.Client(base_url=MCP_SERVER_URL, timeout=10.0, headers=headers)


def _handle_http_error(error: Exception) -> Dict[str, Any]:
    return {
        "error": str(error),
        "type": error.__class__.__name__,
    }


@tool
def get_commander_profile(name: str) -> Dict[str, Any]:
    """
    Fetch a detailed profile for a specific commander.

    Use this tool whenever you need background on a commander mentioned
    in the analysis query, including their typical tactics, notable
    campaigns, leadership style, and strategic preferences.
    """

    try:
        with _build_client() as client:
            response = client.get(f"/commander/{name}")
            response.raise_for_status()
            return response.json()
    except Exception as exc:  # noqa: BLE001
        return _handle_http_error(exc)


@tool
def get_battle_context(name: str) -> Dict[str, Any]:
    """
    Fetch contextual information for a specific historical battle.

    Use this tool to retrieve at least one major battle for each
    commander, including terrain, forces involved, outcome, and
    tactical decisions, so you can ground your comparison in
    concrete battlefield behavior.
    """

    try:
        with _build_client() as client:
            response = client.get(f"/battle/{name}")
            response.raise_for_status()
            return response.json()
    except Exception as exc:  # noqa: BLE001
        return _handle_http_error(exc)


@tool
def get_era_technology(era: str) -> Dict[str, Any]:
    """
    Fetch technology level and military innovations for a given era.

    Use this tool for every commander involved to understand their
    technological baseline (weapons, armor, logistics, communication),
    so you can explicitly account for technology gaps when comparing
    potential outcomes.
    """

    try:
        with _build_client() as client:
            response = client.get(f"/era-technology/{era}")
            response.raise_for_status()
            return response.json()
    except Exception as exc:  # noqa: BLE001
        return _handle_http_error(exc)


@tool
def get_civilization_stats(name: str) -> Dict[str, Any]:
    """
    Fetch economic, demographic, and military statistics for a civilization.

    Use this tool when a commander is strongly associated with a specific
    polity or civilization and you need broader context (population,
    economy, resource base, and typical army composition) to refine
    combat power estimates.
    """

    try:
        with _build_client() as client:
            response = client.get(f"/civilization/{name}")
            response.raise_for_status()
            return response.json()
    except Exception as exc:  # noqa: BLE001
        return _handle_http_error(exc)


@tool
def calculate_combat_score(data: str) -> Dict[str, Any]:
    """
    Calculate a comparative combat score from structured input data.

    Always call this tool once you have gathered commander profiles,
    battle examples, technology levels, and relevant civilization stats.
    Provide a JSON-serializable string containing all relevant factors
    for both commanders; the tool returns normalized scores suitable
    for selecting a winner and estimating confidence.
    """

    try:
        payload = json.loads(data)
    except json.JSONDecodeError as exc:
        return {
            "error": "Invalid JSON provided to calculate_combat_score.",
            "details": str(exc),
        }

    try:
        with _build_client() as client:
            response = client.post("/combat-score", json=payload)
            response.raise_for_status()
            return response.json()
    except Exception as exc:  # noqa: BLE001
        return _handle_http_error(exc)

