"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def api_root(request):
    """Root index for the PHARVO backend (avoids a bare 404 on `/`)."""
    return JsonResponse(
        {
            "service": "PHARVO API",
            "status": "running",
            "endpoints": {
                "auth": "/api/auth/",
                "inventory": "/api/inventory/",
                "sales": "/api/sales/",
                "purchases": "/api/purchases/",
                "customers": "/api/customers/",
                "crm": "/api/crm/reminders/",
                "dashboard": "/api/dashboard/",
                "reports": "/api/reports/",
                "notifications": "/api/notifications/",
                "audit": "/api/audit/",
                "ai": "/api/ai/query/",
                "admin": "/admin/",
            },
        }
    )


urlpatterns = [
    path("", api_root, name="api-root"),
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("ai.urls")),
    path("api/", include("customers.urls")),
    path("api/", include("inventory.urls")),
    path("api/", include("sales.urls")),
    path("api/", include("purchases.urls")),
    path("api/", include("crm.urls")),
    path("api/", include("dashboard.urls")),
    path("api/", include("notifications.urls")),
    path("api/", include("audit.urls")),
]
