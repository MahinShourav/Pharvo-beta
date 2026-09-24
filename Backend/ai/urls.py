from django.urls import path

from .views import ai_query

urlpatterns = [
    path("ai/query/", ai_query, name="ai-query"),
]
