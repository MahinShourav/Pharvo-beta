from datetime import date, timedelta

from django.db.models import F
from rest_framework.exceptions import ValidationError

from .models import Product


def is_expired(expiry_date, on_date=None):
    if expiry_date is None:
        return False
    return expiry_date < (on_date or date.today())


def expiry_status(expiry_date, window_days, on_date=None):
    today = on_date or date.today()
    if expiry_date is None:
        return "valid"
    if expiry_date < today:
        return "expired"
    if expiry_date <= today + timedelta(days=window_days):
        return "near_expiry"
    return "valid"


def _lock_products(items):
    product_ids = sorted({item.product_id for item in items})
    if not product_ids:
        return {}
    products = Product.objects.select_for_update().filter(id__in=product_ids)
    return {product.id: product for product in products}


def _pcs_quantity(item, product):
    """PC-equivalent quantity of a sale line.

    Prefers the value captured on the sale item at sale time so historical
    sales stay reversible even if pack sizes change afterwards; falls back to
    converting through the product's current pack configuration.
    """
    stored = getattr(item, "quantity_pcs", None)
    if stored:
        return stored
    unit = getattr(item, "unit", None) or Product.Unit.PC
    per_unit = product.units_in(unit)
    if per_unit is None:
        raise ValidationError(
            {
                "items": (
                    f"'{product.name}' has no {unit} pack size configured, so it "
                    f"cannot be sold by that unit."
                )
            }
        )
    return item.quantity * per_unit


def _adjust(items, sign):
    locked = _lock_products(items)
    for item in items:
        product = locked.get(item.product_id)
        pcs = (
            _pcs_quantity(item, product)
            if product is not None
            else item.quantity
        )
        Product.objects.filter(id=item.product_id).update(
            stock_quantity=F("stock_quantity") + sign * pcs
        )


def add_purchase_stock(items):
    _adjust(items, 1)


def remove_purchase_stock(items):
    _adjust(items, -1)


def restore_sale_stock(items):
    _adjust(items, 1)


def deduct_sale_stock(items):
    locked = _lock_products(items)
    for item in items:
        product = locked.get(item.product_id)
        if product is not None:
            pcs = _pcs_quantity(item, product)
            if product.stock_quantity < pcs:
                raise ValidationError(
                    {
                        "items": (
                            f"Insufficient stock for '{product.name}': "
                            f"requested {item.quantity} {getattr(item, 'unit', 'pc')} "
                            f"({pcs} pcs), available {product.stock_quantity} pcs."
                        )
                    }
                )
    for item in items:
        product = locked.get(item.product_id)
        pcs = (
            _pcs_quantity(item, product)
            if product is not None
            else item.quantity
        )
        Product.objects.filter(id=item.product_id).update(
            stock_quantity=F("stock_quantity") - pcs
        )
