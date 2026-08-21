from django.urls import path

from .views import get_frost_risk, get_weather_now, get_weather_now_to_six_days

urlpatterns = [
    path("weathers-days/", get_weather_now_to_six_days, name="weather_6days"),
    path("weathers-now/", get_weather_now, name="weather-now"),
    path("frost-risk/", get_frost_risk, name="frost-risk"),
]
