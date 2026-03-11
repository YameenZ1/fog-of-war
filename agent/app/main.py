from fastapi import FastAPI

app = FastAPI(
    title="Historical Battle Analyzer - Agent",
    description=(
        "LangChain-based backend for orchestrating AI analysis of historical battles. "
        "Currently a placeholder with no real logic implemented."
    ),
    version="0.0.1",
)


@app.get("/health")
async def health() -> dict:
    """
    Lightweight healthcheck endpoint for the agent service.

    This will remain simple; future endpoints will coordinate with
    language models and the MCP Wikipedia server.
    """

    return {"status": "ok", "service": "agent"}

