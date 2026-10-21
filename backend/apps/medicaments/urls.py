from rest_framework.routers import SimpleRouter

from .views import MedicamentViewSet

router = SimpleRouter()
router.register("", MedicamentViewSet, basename="medicament")

urlpatterns = router.urls
