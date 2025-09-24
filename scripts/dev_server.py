from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import PlainTextResponse, RedirectResponse
from starlette.routing import Mount
from starlette.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
DIST_DIR = FRONTEND_DIR / "dist"


def ensure_frontend_build() -> Optional[str]:
    """Ensure the frontend build artifacts exist, building them if needed."""
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return None
    try:
        subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, check=True)
    except subprocess.CalledProcessError as exc:
        return (
            "Failed to build frontend. "
            "Run 'npm install' and 'npm run build' in frontend/ manually. "
            f"Original error: {exc}"
        )
    if not index_file.exists():
        return "Frontend build succeeded but dist/index.html is missing."
    return None


server = FastMCP(name="AI Shift App Dev", instructions="Development server for the shift scheduler UI")

build_error = ensure_frontend_build()
if not build_error:
    server._custom_starlette_routes.append(
        Mount("/app", app=StaticFiles(directory=DIST_DIR, html=True), name="app")
    )


@server.custom_route("/", methods=["GET"])
async def root(_: Request):
    if build_error:
        return PlainTextResponse(build_error, status_code=500)
    return RedirectResponse(url="/app/")


__all__ = ["server"]
