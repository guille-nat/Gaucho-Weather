from django.urls import path

from .views import PublicForecastView

urlpatterns = [
    path("pronostico/", PublicForecastView.as_view(), name="public-forecast"),
]
