from django.urls import path

from . import views

urlpatterns = [
    path("patient-info/", views.ProtocolPatientInfoView.as_view(), name="protocol-patient-info"),
    path("information-anesthesia/", views.InformationAnesthesiaView.as_view(), name="protocol-information-anesthesia"),
    path("venous-access/pvc/", views.VenousAccessPVCView.as_view(), name="protocol-venous-pvc"),
    path("venous-access/cvc/", views.VenousAccessCVCView.as_view(), name="protocol-venous-cvc"),
    path("premedication/", views.PremedicationView.as_view(), name="protocol-premedication"),
    path("tube-installations/", views.TubeInstallationsView.as_view(), name="protocol-tube-installations"),
    path("laryngeal-masks/", views.LaryngealMasksView.as_view(), name="protocol-laryngeal-masks"),
    path("airway/", views.AirwayView.as_view(), name="protocol-airway"),
    path("redirecting-patient/", views.RedirectingPatientView.as_view(), name="protocol-redirecting-patient"),
    path("ventilator/", views.VentilatorView.as_view(), name="protocol-ventilator"),
    path("maintaining-anesthesia/", views.MaintainingAnesthesiaView.as_view(), name="protocol-maintaining-anesthesia"),
    path("patient-transferred/", views.PatientTransferredView.as_view(), name="protocol-patient-transferred"),
    path("print/", views.ProtocolPrintView.as_view(), name="protocol-print"),
]
