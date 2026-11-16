import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from kombu.exceptions import OperationalError
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from apps.accounts.plans import check_limit
from apps.archiver import history
from apps.archiver.cells import grid_cell
from apps.archiver.forecast import forecasts
from apps.archiver.summary import tonight_summaries
from apps.archiver.tasks import backfill_history

from .models import Lote
from .serializers import LoteSerializer

logger = logging.getLogger(__name__)

NO_FORECAST = "Todavía no hay pronóstico para este lote."


def _load_history_later(lote: Lote) -> None:
    """Queue the lote cell's past weather (S9–S11) once the lote is committed."""
    if not settings.HISTORY_BACKFILL_ON_CREATE:
        return

    def queue():
        try:
            backfill_history.delay(str(lote.latitude), str(lote.longitude))
        except OperationalError:
            # The daily run and the next save try again; saving the lote must not fail.
            logger.exception("Could not queue the history backfill of lote %s", lote.pk)

    transaction.on_commit(queue)


class LoteViewSet(viewsets.ModelViewSet):
    serializer_class = LoteSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # Scoped to the owner, so another user's lote is a 404, not a 403.
        return Lote.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        with transaction.atomic():
            check_limit(self.request.user, "lotes")
            lote = serializer.save(user=self.request.user)
            _load_history_later(lote)

    def perform_update(self, serializer):
        with transaction.atomic():
            lote = serializer.save()
            _load_history_later(lote)  # a moved lote may sit in another cell

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

    @action(detail=True, methods=["get"])
    def historico(self, request, pk=None):
        """S9, S10: past hours and daily summaries of the lote, from our own dataset."""
        lote = self.get_object()
        today = timezone.localdate()
        try:
            start, end = history.parse_range(
                request.query_params.get("desde"), request.query_params.get("hasta"), today
            )
        except history.RangeError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        cell = grid_cell(lote.latitude, lote.longitude)
        return Response(history.lote_history(cell, start, end, today))
