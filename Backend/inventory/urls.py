from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    DrugInteractionViewSet,
    MedicineGroupViewSet,
    ProductViewSet,
    SupplierViewSet,
    SupplierRestockViewSet,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("groups", MedicineGroupViewSet, basename="medicine-group")
router.register("interactions", DrugInteractionViewSet, basename="drug-interaction")
router.register("products", ProductViewSet, basename="product")
router.register("restock", SupplierRestockViewSet, basename="supplier-restock")

urlpatterns = router.urls
