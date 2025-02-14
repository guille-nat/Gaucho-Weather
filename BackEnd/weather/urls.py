from django.urls import path
from .views import get_weather

urlpatterns = [
    path("weathers/<str:lat>/<str:lon>", get_weather, name="get_weather"),
]
