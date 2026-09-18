"""Views that serve the built React frontend from the Django backend.

The Vite build output (``Frontend/dist``) is served at the site root so the
application is reachable from a single URL (http://127.0.0.1:8000). During
development the Vite dev server (http://localhost:5173) remains the preferred
way to work on the frontend.
"""

from django.conf import settings
from django.http import HttpResponse

FRONTEND_DIST = settings.BASE_DIR.parent / "Frontend" / "dist"


def serve_frontend(request, path=""):
    """Return the SPA shell for the path-based frontend routes."""
    index_path = FRONTEND_DIST / "index.html"
    try:
        content = index_path.read_text()
    except OSError:
        return HttpResponse(
            "Frontend build not found. Run `npm run build` in the Frontend directory.",
            status=503,
        )
    return HttpResponse(content, content_type="text/html; charset=utf-8")