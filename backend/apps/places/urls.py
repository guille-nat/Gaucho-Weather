from django.urls import path

from .views import PlaceReverseView, PlaceSearchView

urlpatterns = [
    path("lugares/", PlaceSearchView.as_view(), name="place-search"),
    path("lugares/reverso/", PlaceReverseView.as_view(), name="place-reverse"),
]
