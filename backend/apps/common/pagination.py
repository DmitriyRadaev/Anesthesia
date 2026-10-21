from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Постраничная навигация: `?page=N&page_size=M` (по умолчанию 20, максимум 100)."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
