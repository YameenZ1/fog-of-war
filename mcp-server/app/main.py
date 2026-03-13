import os
import secrets
from typing import List, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field
from urllib.parse import quote


WIKIPEDIA_API_BASE = "https://en.wikipedia.org/api/rest_v1"

# ── Shared-secret authentication ──────────────────────────────────────────────
# Set MCP_API_KEY in your .env to require all callers to present the same
# secret in the X-API-Key request header.  If the variable is not set (or
# empty) the server runs in unauthenticated dev-mode and logs a warning.
_MCP_API_KEY: str = os.getenv("MCP_API_KEY", "")


async def verify_api_key(x_api_key: str = Header(default="")) -> None:
    """FastAPI dependency that enforces the shared MCP secret.

    Uses ``secrets.compare_digest`` for constant-time comparison so the
    check is not vulnerable to timing attacks.  Authentication is skipped
    entirely when MCP_API_KEY is not configured (dev-mode).
    """
    if not _MCP_API_KEY:
        # No key configured — allow all requests but warn once at startup.
        return
    if not secrets.compare_digest(x_api_key, _MCP_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header.",
        )


app = FastAPI(
    title="Historical Battle Analyzer - MCP Wikipedia Server",
    description=(
        "FastAPI microservice that wraps the Wikipedia REST API and exposes "
        "structured endpoints for the Historical Battle Analyzer."
    ),
    version="0.0.2",
)


class HealthResponse(BaseModel):
    """Simple healthcheck response body."""

    status: str
    service: str


class CommanderResponse(BaseModel):
    """Structured information about a military commander."""

    name: str
    summary: str
    birth_year: Optional[int] = None
    death_year: Optional[int] = None
    nationality: Optional[str] = None
    notable_battles: List[str] = Field(default_factory=list)
    win_loss_record: Optional[str] = None


class BattleResponse(BaseModel):
    """Structured information about a specific battle."""

    name: str
    summary: str
    year: Optional[int] = None
    location: Optional[str] = None
    combatants: List[str] = Field(default_factory=list)
    outcome: Optional[str] = None
    troop_strength: Optional[str] = None
    tactics_summary: Optional[str] = None


class EraTechnologyResponse(BaseModel):
    """Structured information about military technology for a given era."""

    era: str
    summary: str
    key_weapons: List[str] = Field(default_factory=list)
    mobility_type: Optional[str] = None
    supply_chain_strength: Optional[str] = Field(
        default=None, description="One of: low, medium, high"
    )
    notable_advantages: List[str] = Field(default_factory=list)


class CivilizationResponse(BaseModel):
    """Structured information about a civilization or empire at its peak."""

    name: str
    summary: str
    peak_period: Optional[str] = None
    geographic_size_proxy: Optional[str] = Field(
        default=None, description="One of: small, medium, large, vast"
    )
    military_strength_notes: Optional[str] = None
    notable_conflicts: List[str] = Field(default_factory=list)


class CommanderAttributes(BaseModel):
    """Quantitative attributes describing a commander for combat scoring."""

    tactical_genius: int = Field(ge=1, le=10)
    army_size: int = Field(ge=1, le=10)
    tech_level: int = Field(ge=1, le=10)
    terrain_adaptability: int = Field(ge=1, le=10)
    supply_chain: int = Field(ge=1, le=10)
    morale: int = Field(ge=1, le=10)


class CombatScoreRequest(BaseModel):
    """Request body containing two commanders to compare."""

    commander1: CommanderAttributes
    commander2: CommanderAttributes


class CommanderScore(BaseModel):
    """Computed score for a commander."""

    raw_score: float


class CombatScoreResponse(BaseModel):
    """Response body containing scores and overall winner."""

    commander1: CommanderScore
    commander2: CommanderScore
    winner: str


async def _fetch_wikipedia_summary(title: str) -> dict:
    """
    Fetch the Wikipedia REST API page summary for a given title.

    Raises an HTTPException if the page is not found or the API call fails.
    """

    url = f"{WIKIPEDIA_API_BASE}/page/summary/{quote(title)}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            url,
            headers={
                "User-Agent": "historical-battle-analyzer/1.0 (educational project; contact@example.com)"
            },
        )

    if response.status_code == status.HTTP_404_NOT_FOUND:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wikipedia page not found for '{title}'.",
        )
    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Wikipedia API error (status {response.status_code}).",
        )

    return response.json()


def _extract_first_year(text: str) -> Optional[int]:
    """Best-effort extraction of the first 4‑digit year from a text blob."""

    import re

    match = re.search(r"(1[0-9]{3}|20[0-9]{2})", text)
    return int(match.group(0)) if match else None


@app.on_event("startup")
async def _startup_security_check() -> None:
    import logging
    log = logging.getLogger("fog-of-war.mcp-server")
    if not _MCP_API_KEY:
        log.warning(
            "MCP_API_KEY is not set — running in unauthenticated dev-mode. "
            "Set MCP_API_KEY in .env before deploying."
        )
    else:
        log.info("MCP_API_KEY is configured — API key authentication is active.")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """
    Lightweight healthcheck endpoint for the MCP Wikipedia server.

    Returns a simple JSON body that can be used by monitoring systems to
    confirm that the service is up and responding.
    """

    return HealthResponse(status="ok", service="mcp-server")


@app.get("/commander/{name}", response_model=CommanderResponse, dependencies=[Depends(verify_api_key)])
async def get_commander(name: str) -> CommanderResponse:
    """
    Look up a military commander on Wikipedia and return structured details.

    This endpoint uses the Wikipedia REST `/page/summary/{title}` API to
    retrieve a commander by name and then heuristically extracts a short
    summary, birth/death years, nationality, notable battles, and any
    mentioned win/loss record if present in the summary text.
    """

    data = await _fetch_wikipedia_summary(name)
    extract = data.get("extract", "") or ""
    title = data.get("title", name)

    # Very lightweight, heuristic parsing of the summary text.
    birth_year = None
    death_year = None
    nationality = None
    notable_battles: List[str] = []
    win_loss_record = None

    if "born" in extract:
        birth_year = _extract_first_year(extract)
    if "died" in extract or "killed" in extract:
        # Try to find the second year in the text for death year.
        import re

        years = re.findall(r"(1[0-9]{3}|20[0-9]{2})", extract)
        if len(years) >= 2:
            death_year = int(years[1])

    # Nationality often appears early in the summary, e.g. "was a French general"
    for token in ("French", "British", "Roman", "German", "American", "Russian"):
        if token in extract:
            nationality = token
            break

    # Notable battles – look for patterns like "Battle of X"
    import re

    for match in re.findall(r"Battle of ([A-Z][A-Za-z0-9\s\-]+)", extract):
        battle_name = f"Battle of {match.strip()}"
        if battle_name not in notable_battles:
            notable_battles.append(battle_name)

    # Win/loss record – a very loose heuristic search.
    match = re.search(
        r"(\d+\s+wins?,?\s*\d*\s*losses?)|(\d+\s+victories?)", extract, re.IGNORECASE
    )
    if match:
        win_loss_record = match.group(0)

    return CommanderResponse(
        name=title,
        summary=extract,
        birth_year=birth_year,
        death_year=death_year,
        nationality=nationality,
        notable_battles=notable_battles,
        win_loss_record=win_loss_record,
    )


@app.get("/battle/{name}", response_model=BattleResponse, dependencies=[Depends(verify_api_key)])
async def get_battle(name: str) -> BattleResponse:
    """
    Look up a specific battle on Wikipedia and return structured details.

    This endpoint uses the Wikipedia REST `/page/summary/{title}` API to
    retrieve information about a battle and extracts an approximate year,
    location, list of combatants, outcome, troop strength (if mentioned),
    and a brief tactics summary derived from the main page summary.
    """

    import re

    data = await _fetch_wikipedia_summary(name)
    extract = data.get("extract", "") or ""
    title = data.get("title", name)

    year = _extract_first_year(extract)

    location = None
    for pattern in [r"fought at ([^.,;]+)", r"fought near ([^.,;]+)", r"near ([^.,;]+)"]:
        m = re.search(pattern, extract, re.IGNORECASE)
        if m:
            location = m.group(1).strip()
            break

    combatants: List[str] = []
    m = re.search(r"between ([^.,;]+) and ([^.,;]+)", extract, re.IGNORECASE)
    if m:
        combatants = [m.group(1).strip(), m.group(2).strip()]

    outcome = None
    for pattern in [
        r"resulted in ([^.,;]+)",
        r"ended in ([^.,;]+)",
        r"was a ([^.,;]+) victory",
    ]:
        m = re.search(pattern, extract, re.IGNORECASE)
        if m:
            outcome = m.group(0).strip()
            break

    troop_strength = None
    m = re.search(
        r"([0-9][0-9,]*\s*(?:troops|soldiers|men))", extract, re.IGNORECASE
    )
    if m:
        troop_strength = m.group(0)

    # Simple tactics summary – take the first sentence.
    tactics_summary = extract.split(".")[0].strip() + "." if extract else None

    return BattleResponse(
        name=title,
        summary=extract,
        year=year,
        location=location,
        combatants=combatants,
        outcome=outcome,
        troop_strength=troop_strength,
        tactics_summary=tactics_summary,
    )


@app.get("/era-technology/{era}", response_model=EraTechnologyResponse, dependencies=[Depends(verify_api_key)])
async def get_era_technology(era: str) -> EraTechnologyResponse:
    """
    Look up military technology for a given era or civilization on Wikipedia.

    This endpoint expects an era descriptor such as
    "Roman Republic military" or "Napoleonic era warfare" and returns
    key weapons, mobility characteristics, an approximate supply chain
    strength, and notable advantages, all heuristically extracted from the
    Wikipedia page summary.
    """

    import re

    data = await _fetch_wikipedia_summary(era)
    extract = data.get("extract", "") or ""
    title = data.get("title", era)

    key_weapons: List[str] = []
    for match in re.findall(
        r"\b(sword|spears?|pikes?|muskets?|rifles?|artillery|tanks?|chariots?|archers?)\b",
        extract,
        re.IGNORECASE,
    ):
        weapon = match.lower()
        if weapon not in key_weapons:
            key_weapons.append(weapon)

    mobility_type = None
    if any(word in extract.lower() for word in ["cavalry", "horse", "mounted"]):
        mobility_type = "mounted"
    elif any(word in extract.lower() for word in ["naval", "fleet", "ships"]):
        mobility_type = "naval"
    elif any(word in extract.lower() for word in ["armour", "armor", "tank"]):
        mobility_type = "mechanized"
    else:
        mobility_type = "infantry-centric"

    supply_chain_strength = "medium"
    lower = extract.lower()
    if any(word in lower for word in ["logistics", "supply lines", "provisioning"]):
        supply_chain_strength = "high"
    if any(word in lower for word in ["poorly supplied", "shortages", "famine"]):
        supply_chain_strength = "low"

    notable_advantages: List[str] = []
    for pattern in [
        r"superior ([^.,;]+)",
        r"advanced ([^.,;]+)",
        r"innovative ([^.,;]+)",
    ]:
        for m in re.findall(pattern, extract, re.IGNORECASE):
            advantage = m.strip()
            if advantage not in notable_advantages:
                notable_advantages.append(advantage)

    return EraTechnologyResponse(
        era=title,
        summary=extract,
        key_weapons=key_weapons,
        mobility_type=mobility_type,
        supply_chain_strength=supply_chain_strength,
        notable_advantages=notable_advantages,
    )


@app.get("/civilization/{name}", response_model=CivilizationResponse, dependencies=[Depends(verify_api_key)])
async def get_civilization(name: str) -> CivilizationResponse:
    """
    Look up a civilization or empire at its peak on Wikipedia.

    This endpoint returns a brief summary, an approximate peak period,
    a geographic size proxy (small/medium/large/vast), notes on military
    strength, and a list of notable conflicts, all based on the page
    summary returned by the Wikipedia REST API.
    """

    import re

    data = await _fetch_wikipedia_summary(name)
    extract = data.get("extract", "") or ""
    title = data.get("title", name)

    peak_period = None
    m = re.search(
        r"(during|in)\s+the\s+([A-Za-z0-9\s\-]+century|[A-Za-z0-9\s\-]+era)",
        extract,
        re.IGNORECASE,
    )
    if m:
        peak_period = m.group(0).strip()

    geographic_size_proxy = None
    lower = extract.lower()
    if any(word in lower for word in ["city-state", "city state", "small kingdom"]):
        geographic_size_proxy = "small"
    elif any(word in lower for word in ["regional power", "regional empire"]):
        geographic_size_proxy = "medium"
    elif any(word in lower for word in ["large empire", "sprawling empire"]):
        geographic_size_proxy = "large"
    elif any(word in lower for word in ["world empire", "vast empire", "stretched from"]):
        geographic_size_proxy = "vast"

    military_strength_notes = None
    for pattern in [
        r"military strength[^.]*\.",
        r"military power[^.]*\.",
        r"army[^.]*\.",
    ]:
        m = re.search(pattern, extract, re.IGNORECASE)
        if m:
            military_strength_notes = m.group(0).strip()
            break

    notable_conflicts: List[str] = []
    for match in re.findall(
        r"([A-Z][A-Za-z0-9\s\-]+ War|Battle of [A-Z][A-Za-z0-9\s\-]+)",
        extract,
    ):
        conflict = match.strip()
        if conflict not in notable_conflicts:
            notable_conflicts.append(conflict)

    return CivilizationResponse(
        name=title,
        summary=extract,
        peak_period=peak_period,
        geographic_size_proxy=geographic_size_proxy,
        military_strength_notes=military_strength_notes,
        notable_conflicts=notable_conflicts,
    )


def _compute_commander_score(attrs: CommanderAttributes) -> float:
    """
    Compute a weighted combat score for a commander.

    The weights emphasize tactical genius and technology while still taking
    into account army size, terrain adaptability, supply, and morale.
    """

    weights = {
        "tactical_genius": 0.3,
        "army_size": 0.15,
        "tech_level": 0.2,
        "terrain_adaptability": 0.15,
        "supply_chain": 0.1,
        "morale": 0.1,
    }

    score = (
        attrs.tactical_genius * weights["tactical_genius"]
        + attrs.army_size * weights["army_size"]
        + attrs.tech_level * weights["tech_level"]
        + attrs.terrain_adaptability * weights["terrain_adaptability"]
        + attrs.supply_chain * weights["supply_chain"]
        + attrs.morale * weights["morale"]
    )
    return round(score * 10.0, 2)


@app.post("/combat-score", response_model=CombatScoreResponse, dependencies=[Depends(verify_api_key)])
async def combat_score(payload: CombatScoreRequest) -> CombatScoreResponse:
    """
    Compute weighted combat scores for two commanders and declare a winner.

    This endpoint is entirely local (no Wikipedia calls) and accepts two
    commanders described by quantitative attributes. It returns each
    commander's weighted score and the identifier of the winner
    ("commander1", "commander2", or "tie").
    """

    score1 = _compute_commander_score(payload.commander1)
    score2 = _compute_commander_score(payload.commander2)

    if score1 > score2:
        winner = "commander1"
    elif score2 > score1:
        winner = "commander2"
    else:
        winner = "tie"

    return CombatScoreResponse(
        commander1=CommanderScore(raw_score=score1),
        commander2=CommanderScore(raw_score=score2),
        winner=winner,
    )
