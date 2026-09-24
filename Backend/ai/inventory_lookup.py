"""In-stock lookup for AI candidate generics.

Each candidate generic is matched exactly (case-insensitive, whitespace
trimmed) against the product ``generic_name``. Only active, in-stock,
non-expired products are returned. A generic with no inventory match is
reported with status ``stock_out`` and an empty product list — no
alternative or substitute medicine is ever shown. Duplicate products are
collapsed so each product appears once. No database changes.
"""

from django.db.models import Q
from django.utils import timezone

from inventory.models import InventoryProduct


def _normalize_generic(value):
    """Normalize a generic name for exact comparison."""
    return str(value or "").strip().casefold()


def find_available_medicines(candidate_generics, limit_per_generic=10):
    today = timezone.localdate()

    # Normalize and de-duplicate the requested generics, preserving order.
    # The original label is kept for display; matching uses the key.
    ordered = []
    seen_generics = set()
    for generic in candidate_generics or []:
        key = _normalize_generic(generic)
        if not key or key in seen_generics:
            continue
        seen_generics.add(key)
        ordered.append((str(generic).strip(), key))

    results = []

    for display, key in ordered:
        medicines = (
            InventoryProduct.objects.filter(
                generic_name__iexact=key,
                is_active=True,
                stock_quantity__gt=0,
            )
            .filter(Q(expiry_date__gte=today) | Q(expiry_date__isnull=True))
            .order_by("expiry_date", "name")[:limit_per_generic]
        )

        matches = []
        seen_products = set()
        for product in medicines:
            # Exact normalized comparison: never match an unrelated generic.
            if _normalize_generic(product.generic_name) != key:
                continue
            product_key = (
                _normalize_generic(product.name),
                _normalize_generic(product.brand),
            )
            if product_key in seen_products:
                continue
            seen_products.add(product_key)
            matches.append(
                {
                    "product_id": product.id,
                    "name": product.name,
                    "brand": product.brand,
                    "unit_price": str(product.unit_price),
                    "strip_price": (
                        str(product.strip_price)
                        if product.strip_price is not None
                        else None
                    ),
                    "box_price": (
                        str(product.box_price)
                        if product.box_price is not None
                        else None
                    ),
                    "stock_quantity": product.stock_quantity,
                    "reorder_level": product.reorder_level,
                    "is_low_stock": product.stock_quantity
                    <= (product.reorder_level or 0),
                    "expiry_date": (
                        product.expiry_date.isoformat()
                        if product.expiry_date
                        else None
                    ),
                }
            )

        results.append(
            {
                "candidate_generic": display,
                "status": "available" if matches else "stock_out",
                "available_medicines": matches,
            }
        )

    return results
