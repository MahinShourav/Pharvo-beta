from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPharmacyStaff
from inventory.models import Product

from .services import detect_cart_interactions


class CheckInteractionsView(APIView):
    """Check a POS cart for known drug interactions.

    Accepts the same ``items`` shape used by the POS checkout endpoint:
    ``[{"product": <id>, "quantity": <int>}, ...]``. Returns every non-beneficial
    interaction detected between the products in the cart so the pharmacist can
    review it before completing the sale.
    """

    permission_classes = [IsPharmacyStaff]

    def post(self, request):
        items = request.data.get("items") or []
        if not isinstance(items, list) or not items:
            return Response(
                {"detail": "Provide at least one item to check for interactions."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product_ids = []
        for item in items:
            if isinstance(item, dict):
                product_id = item.get("product") or item.get("product_id")
            else:
                product_id = item
            try:
                product_id = int(product_id)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Each item must include a valid product id."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            product_ids.append(product_id)

        products = list(
            Product.objects.filter(id__in=set(product_ids))
            .select_related("group", "category")
        )
        if not products:
            return Response(
                {"detail": "No valid products were provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        interactions = detect_cart_interactions(products)
        return Response(
            {
                "interactions": interactions,
                "count": len(interactions),
            },
            status=status.HTTP_200_OK,
        )