from django.urls import path

from .views import LabResultView, LabSchemaView

urlpatterns = [
    path("", LabResultView.as_view(), name="labs-result"),
    path("schema/", LabSchemaView.as_view(), name="labs-schema"),
]
