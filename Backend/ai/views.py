"""AI decision-support endpoint: POST /api/ai/query/."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .inventory_lookup import find_available_medicines
from .predictor import predict_health_problem


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ai_query(request):
    text = request.data.get("text", "")

    if not text or not str(text).strip():
        return Response(
            {"error": "text is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = predict_health_problem(text)
        result["inventory_matches"] = find_available_medicines(
            result.get("candidate_generics", [])
        )
        return Response(result)
    except Exception as exc:
        return Response(
            {"error": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
