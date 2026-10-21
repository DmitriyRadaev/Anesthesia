from rest_framework.routers import SimpleRouter

from .views import PatientViewSet

router = SimpleRouter()
router.register("", PatientViewSet, basename="patient")

urlpatterns = router.urls
