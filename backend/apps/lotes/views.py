from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from apps.archiver.cells import grid_cell
from apps.archiver.forecast import forecasts
from apps.archiver.summary import tonight_summaries

from .models import Lote
from .serializers import LoteSerializer

NO_FORECAST = "Todavía no hay pronóstico para este lote."


class LoteViewSet(viewsets.ModelViewSet):
    serializer_class = LoteSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # Scoped to the owner, so another user's lote is a 404, not a 403.
        return Lote.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def list(self, request, *args, **kwargs):
        lotes = list(self.get_queryset())
        cells = {grid_cell(lote.latitude, lote.longitude) for lote in lotes}
        summaries = tonight_summaries(cells)
        found = forecasts(cells)
        context = self.get_serializer_context()
        context["summaries"] = {cell: summaries.get(cell) for cell in cells}
        context["headlines"] = {
            cell: found[cell].headline if cell in found else None for cell in cells
        }
        return Response(self.get_serializer_class()(lotes, many=True, context=context).data)

    @action(detail=True, methods=["get"])
    def pronostico(self, request, pk=None):
        lote = self.get_object()
        cell = grid_cell(lote.latitude, lote.longitude)
        forecast = forecasts({cell}).get(cell)
        if forecast is None:
            raise NotFound(NO_FORECAST)
        return Response(forecast.payload)
