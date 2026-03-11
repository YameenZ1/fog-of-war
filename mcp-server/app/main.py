from fastapi import FastAPI

app = FastAPI(
    title="Historical Battle Analyzer - MCP Wikipedia Server",
    description=(
        "FastAPI microservice that will wrap the Wikipedia API and expose "
        "structured endpoints for the Historical Battle Analyzer. "
        "Currently a placeholder with no real Wikipedia integration."
    ),
    version="0.0.1",
)


@app.get("/health")
async def health() -> dict:
    """
    Lightweight healthcheck endpoint for the MCP Wikipedia server.
    """

    return {"status": "ok", "service": "mcp-server"}

