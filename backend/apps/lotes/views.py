from rest_framework import viewsets
from rest_framework.response import Response

from apps.archiver.cells import grid_cell
from apps.archiver.summary import tonight_summaries

from .models import Lote
from .serializers import LoteSerializer


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
        context = self.get_serializer_context()
        context["summaries"] = {cell: summaries.get(cell) for cell in cells}
        return Response(self.get_serializer_class()(lotes, many=True, context=context).data)
