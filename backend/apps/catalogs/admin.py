from django.apps import apps
from django.contrib import admin

for model in apps.get_app_config("catalogs").get_models():
    admin.site.register(model, list_display=["id", "name", "code", "description"], search_fields=["name"])
