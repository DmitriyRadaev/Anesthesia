from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Role, User
from .services import ensure_can_assign_role, ensure_can_modify


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "surname", "firstname", "lastname", "full_name", "birthdate",
            "role", "role_display", "is_active", "employee_code", "speciality", "department", "job_title",
            "last_login", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "last_login", "created_at", "updated_at"]


class _PasswordMixin:
    def _validate_new_password(self, password: str, user: User | None = None) -> str:
        password_validation.validate_password(password, user)
        return password


class UserCreateSerializer(_PasswordMixin, UserSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"}, min_length=8)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["password"]

    def validate_role(self, role):
        ensure_can_assign_role(self.context["request"].user, role)
        return role

    def validate(self, attrs):
        candidate = User(**{k: v for k, v in attrs.items() if k != "password"})
        try:
            self._validate_new_password(attrs["password"], candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class UserUpdateSerializer(UserSerializer):
    def validate(self, attrs):
        ensure_can_modify(
            self.context["request"].user,
            self.instance,
            new_role=attrs.get("role"),
            new_active=attrs.get("is_active"),
        )
        return attrs


class SetPasswordSerializer(_PasswordMixin, serializers.Serializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_password(self, value):
        try:
            return self._validate_new_password(value, self.context.get("target"))
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)


class ChangePasswordSerializer(SetPasswordSerializer):
    old_password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Текущий пароль указан неверно.")
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(style={"input_type": "password"}, trim_whitespace=False)


class LoginResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    expires_at = serializers.DateTimeField(allow_null=True)
    user = UserSerializer()


class RoleSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class StaffMemberSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()


class MedicalStaffSerializer(serializers.Serializer):
    doctors = StaffMemberSerializer(many=True)
    nurses = StaffMemberSerializer(many=True)


def roles_payload() -> list[dict]:
    return [{"id": value, "name": label} for value, label in Role.choices]
