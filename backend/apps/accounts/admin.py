from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AuthToken, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["surname"]
    list_display = ["username", "surname", "firstname", "lastname", "role", "is_active", "last_login"]
    list_filter = ["role", "is_active", "is_staff"]
    search_fields = ["username", "surname", "firstname", "lastname"]
    readonly_fields = ["last_login", "created_at", "updated_at"]
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("ФИО и профиль", {"fields": ("surname", "firstname", "lastname", "birthdate", "employee_code",
                                      "speciality", "department", "job_title")}),
        ("Доступ", {"fields": ("role", "is_active", "is_staff", "is_superuser")}),
        ("Даты", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("username", "surname", "firstname", "role", "password1", "password2")}),
    )
    filter_horizontal = ()


@admin.register(AuthToken)
class AuthTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "created_at", "expires_at", "last_used_at"]
    readonly_fields = ["user", "key_hash", "created_at", "expires_at", "last_used_at"]
