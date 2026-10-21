from django.apps import AppConfig


class ProtocolConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.protocol"
    label = "protocol"
    verbose_name = "Протокол анестезии"
