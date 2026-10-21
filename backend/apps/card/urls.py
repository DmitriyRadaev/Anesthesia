from django.urls import path

from . import views

urlpatterns = [
    path("patient-info/", views.CardPatientInfoView.as_view(), name="card-patient-info"),
    path("pid-datetime/", views.PidDateTimeView.as_view(), name="card-pid-datetime"),
    path("actions/", views.AnestheticActionsView.as_view(), name="card-actions"),
    path("breath/", views.BreathCharacteristicsView.as_view(), name="card-breath"),
    path("stages/", views.OperationStagesView.as_view(), name="card-stages"),
    path("drugs/totals/", views.DrugTotalsView.as_view(), name="card-drug-totals"),
    path("drugs/<slug:section>/", views.DrugsView.as_view(), name="card-drugs"),
    path("infusions/", views.InfusionsView.as_view(), name="card-infusions"),
    path("transfusions/", views.TransfusionsView.as_view(), name="card-transfusions"),
    path("liquids/", views.LiquidsView.as_view(), name="card-liquids"),
    path("cms/", views.CMSView.as_view(), name="card-cms"),
    path("print/", views.CardPrintView.as_view(), name="card-print"),
]
