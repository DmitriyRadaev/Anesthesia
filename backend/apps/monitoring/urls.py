from django.urls import path

from . import views

urlpatterns = [
    path("operations/<int:operation_id>/monitoring/results/", views.OperationResultsView.as_view(),
         name="monitoring-results"),
    path("monitoring/pids/", views.RecentPidsView.as_view(), name="monitoring-pids"),
    path("monitoring/hl7/", views.HL7IngestView.as_view(), name="monitoring-hl7-ingest"),
    path("cdss/result/<int:operation_id>/", views.CDSSView.as_view(), name="cdss-result"),
]
