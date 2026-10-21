from rest_framework.routers import SimpleRouter

from .views import OperationViewSet

router = SimpleRouter()
router.register("", OperationViewSet, basename="operation")

urlpatterns = router.urls
