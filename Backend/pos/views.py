from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import PosCheckoutSerializer, PosReceiptSerializer


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)


class PosCheckoutView(APIView):
    permission_classes = [IsStaff]

    def post(self, request):
        serializer = PosCheckoutSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        sensitive_items = serializer.sensitive_items
        interactions = serializer.interactions
        if interactions and not serializer.validated_data.get("approve_interactions"):
            return Response(
                {
                    "requires_interaction_approval": True,
                    "message": (
                        "This cart contains medicines with known drug "
                        "interactions. Review them before completing the sale."
                    ),
                    "interactions": interactions,
                },
                status=status.HTTP_200_OK,
            )
        if sensitive_items and not serializer.validated_data.get("approve_sensitive"):
            return Response(
                {
                    "requires_approval": True,
                    "message": (
                        "This cart contains sensitive medicines and requires "
                        "staff approval before the sale can be completed."
                    ),
                    "sensitive_items": [
                        {
                            "product": item["product"].id,
                            "product_name": item["product"].name,
                            "quantity": item["quantity"],
                        }
                        for item in sensitive_items
                    ],
                },
                status=status.HTTP_200_OK,
            )
        sale = serializer.save()
        return Response(
            PosReceiptSerializer(sale).data, status=status.HTTP_201_CREATED
        )
