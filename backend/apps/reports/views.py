from dataclasses import asdict
from urllib.parse import quote

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import CanViewReports

from .services import build_report_4110, render_report_4110_xlsx, report_filename

TAGS = ["Отчёты"]
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PERIOD_PARAMS = [
    OpenApiParameter("date_start", OpenApiTypes.DATE, required=True, description="Дата начала периода (YYYY-MM-DD)"),
    OpenApiParameter("date_end", OpenApiTypes.DATE, required=True, description="Дата окончания периода (YYYY-MM-DD)"),
]


class PeriodSerializer(serializers.Serializer):
    date_start = serializers.DateField()
    date_end = serializers.DateField()

    def validate(self, attrs):
        if attrs["date_end"] < attrs["date_start"]:
            raise serializers.ValidationError({"date_end": ["Дата окончания раньше даты начала."]})
        return attrs


class _ReportView(APIView):
    permission_classes = [CanViewReports]

    def build(self, request):
        period = PeriodSerializer(data=request.query_params)
        period.is_valid(raise_exception=True)
        return build_report_4110(**period.validated_data)


class Report4110DataView(_ReportView):
    @extend_schema(tags=TAGS, summary="Отчёт 41.10 — данные (JSON)", parameters=PERIOD_PARAMS,
                   responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(asdict(self.build(request)))


class Report4110ExcelView(_ReportView):
    @extend_schema(
        tags=TAGS, summary="Отчёт 41.10 — файл Excel", parameters=PERIOD_PARAMS,
        responses={(200, XLSX): OpenApiResponse(OpenApiTypes.BINARY, description="Файл .xlsx")},
    )
    def get(self, request):
        report = self.build(request)
        response = HttpResponse(render_report_4110_xlsx(report), content_type=XLSX)
        filename = report_filename(report)
        response["Content-Disposition"] = f"attachment; filename=\"report_4110.xlsx\"; filename*=UTF-8''{quote(filename)}"
        return response
