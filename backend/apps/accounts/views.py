from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.filters import ChoiceListFilter

from .models import AuthToken, Role, User
from .permissions import CanManageUsers, IsClinicalStaff
from .serializers import (
    ChangePasswordSerializer,
    LoginResponseSerializer,
    LoginSerializer,
    MedicalStaffSerializer,
    RoleSerializer,
    SetPasswordSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
    roles_payload,
)
from .services import ensure_can_modify

AUTH_TAG = ["Авторизация"]


class InvalidCredentials(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Неверный логин или пароль."
    default_code = "invalid_credentials"
USERS_TAG = ["Пользователи"]


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "login"

    @extend_schema(
        tags=AUTH_TAG,
        summary="Вход в систему",
        request=LoginSerializer,
        responses={
            200: LoginResponseSerializer,
            400: OpenApiResponse(description="Не заполнены поля"),
            401: OpenApiResponse(description="Неверный логин или пароль"),
            403: OpenApiResponse(description="Учётная запись деактивирована"),
        },
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        user = authenticate(request, username=username, password=password)
        if user is None:
            inactive = User.objects.filter(username=username, is_active=False).first()
            if inactive is not None and inactive.check_password(password):
                raise PermissionDenied("Учётная запись деактивирована. Обратитесь к администратору.")
            raise InvalidCredentials()

        token, raw_key = AuthToken.objects.issue(user)
        update_last_login(None, user)
        payload = {"token": raw_key, "expires_at": token.expires_at, "user": user}
        return Response(LoginResponseSerializer(payload).data)


class LogoutView(APIView):
    @extend_schema(tags=AUTH_TAG, summary="Выход (отзыв текущего токена)", request=None, responses={204: None})
    def post(self, request):
        if isinstance(request.auth, AuthToken):
            request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    @extend_schema(tags=AUTH_TAG, summary="Текущий пользователь", responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    @extend_schema(tags=AUTH_TAG, summary="Смена собственного пароля", request=ChangePasswordSerializer,
                   responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request, "target": request.user})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["password"])
        request.user.save(update_fields=["password", "updated_at"])
        # Завершаем все прочие сессии пользователя.
        AuthToken.objects.filter(user=request.user).exclude(pk=getattr(request.auth, "pk", None)).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserFilter(filters.FilterSet):
    role = ChoiceListFilter(choices=Role.choices)
    is_active = filters.BooleanFilter()

    class Meta:
        model = User
        fields = ["role", "is_active"]


@extend_schema_view(
    list=extend_schema(summary="Список пользователей (поиск, фильтры, сортировка, пагинация)"),
    retrieve=extend_schema(summary="Пользователь"),
    create=extend_schema(summary="Создать пользователя", request=UserCreateSerializer, responses={201: UserSerializer}),
    update=extend_schema(summary="Изменить пользователя", request=UserUpdateSerializer, responses=UserSerializer),
    partial_update=extend_schema(summary="Частично изменить пользователя (роль, активность, профиль)",
                                 request=UserUpdateSerializer, responses=UserSerializer),
)
@extend_schema(tags=USERS_TAG)
class UserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                  mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Управление пользователями. Доступно Администратору, Заведующему и ИО заведующего."""

    queryset = User.objects.all()
    lookup_value_regex = r"\d+"
    permission_classes = [CanManageUsers]
    filterset_class = UserFilter
    search_fields = ["username", "surname", "firstname", "lastname"]
    ordering_fields = ["surname", "username", "role", "is_active", "created_at", "last_login"]
    ordering = ["-is_active", "surname", "firstname"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in {"update", "partial_update"}:
            return UserUpdateSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        user = serializer.save()
        if not user.is_active:
            AuthToken.objects.filter(user=user).delete()

    @extend_schema(summary="Установить пароль пользователю", request=SetPasswordSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        ensure_can_modify(request.user, user)
        serializer = SetPasswordSerializer(data=request.data, context={"request": request, "target": user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password", "updated_at"])
        AuthToken.objects.filter(user=user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(summary="Справочник ролей", responses=RoleSerializer(many=True))
    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated], pagination_class=None,
            filter_backends=[])
    def roles(self, request):
        return Response(roles_payload())

    @extend_schema(summary="Медицинский персонал (активные врачи и медсёстры)", responses=MedicalStaffSerializer)
    @action(detail=False, methods=["get"], url_path="medical-staff", permission_classes=[IsClinicalStaff],
            pagination_class=None, filter_backends=[])
    def medical_staff(self, request):
        staff = User.objects.filter(is_active=True, role__in=[Role.DOCTOR, Role.NURSE]).order_by("surname", "firstname")
        to_item = lambda u: {"id": u.id, "full_name": u.full_name}  # noqa: E731
        return Response({
            "doctors": [to_item(u) for u in staff if u.role == Role.DOCTOR],
            "nurses": [to_item(u) for u in staff if u.role == Role.NURSE],
        })

    def get_object(self):
        obj = super().get_object()
        if self.request.method not in ("GET", "HEAD", "OPTIONS") and obj.is_superuser and not self.request.user.is_superuser:
            raise PermissionDenied("Учётную запись суперпользователя может изменять только суперпользователь.")
        return obj
