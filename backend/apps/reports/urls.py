from django.urls import path

from .views import Report4110DataView, Report4110ExcelView

urlpatterns = [
    path("4110/", Report4110ExcelView.as_view(), name="report-4110-xlsx"),
    path("4110/data/", Report4110DataView.as_view(), name="report-4110-data"),
]
