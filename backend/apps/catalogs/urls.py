from django.urls import path

from .views import CatalogIndexView, CatalogView

urlpatterns = [
    path("", CatalogIndexView.as_view(), name="catalog-index"),
    path("<slug:slug>/", CatalogView.as_view(), name="catalog-detail"),
]
