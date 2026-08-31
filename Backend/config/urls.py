"""
URL configuration for the PHARVO project.
"""

from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve as serve_static

from .views import FRONTEND_DIST, serve_frontend

urlpatterns = [
    # Frontend SPA shell for the path-based routes. Kept before the admin
    # include so /admin/dashboard is served by the frontend instead of being
    # swallowed by Django admin's catch-all view.
    re_path(
        r"^(?:$|signup/?$|admin/dashboard/?$|pharmacist/dashboard/?$|customer/portal/?$)",
        serve_frontend,
        name="frontend",
    ),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/inventory/", include("inventory.urls")),
    path("api/customers/", include("customers.urls")),
    path("api/purchases/", include("purchases.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/pos/", include("pos.urls")),
    path("api/interactions/", include("interaction.urls")),
    path("api/crm/", include("crm.urls")),
    path("api/dashboard/", include("dashboard.urls")),
    path("api/reports/", include("reports.urls")),
    path("api/notifications/", include("notifications.urls")),
    # Built frontend assets (Vite output)
    path(
        "assets/<path:path>",
        serve_static,
        {"document_root": str(FRONTEND_DIST / "assets")},
        name="frontend_assets",
    ),
]
