from django.urls import path
from .views import get_weather_now_to_six_days, get_weather_now


# Add this to your urlpatterns
urlpatterns = [
    path("weathers-days/", get_weather_now_to_six_days, name="weather_6days"),
    path("weathers-now/", get_weather_now, name="weather-now"),
]
