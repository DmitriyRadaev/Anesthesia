from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

api_patterns = [
    path("auth/", include("apps.accounts.urls_auth")),
    path("users/", include("apps.accounts.urls")),
    path("catalogs/", include("apps.catalogs.urls")),
    path("patients/", include("apps.patients.urls")),
    path("operations/", include("apps.operations.urls")),
    path("operations/<int:operation_id>/protocol/", include("apps.protocol.urls")),
    path("operations/<int:operation_id>/card/", include("apps.card.urls")),
    path("operations/<int:operation_id>/labs/", include("apps.labs.urls")),
    path("", include("apps.monitoring.urls")),
    path("medicaments/", include("apps.medicaments.urls")),
    path("reports/", include("apps.reports.urls")),
    path("health/", include("apps.common.urls")),
]

urlpatterns = [
    path("api/", include(api_patterns)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("django-admin/", admin.site.urls),
]
