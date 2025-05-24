from rest_framework import serializers
from .models import UserPreferences, CustomUser
from django.db import transaction
from rest_framework.response import Response
import json


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer del modelo User,
    con la creación automática del user preferences por defecto.
    """

    email = serializers.EmailField(required=True)  # Asegura que sea obligatorio

    class Meta:
        model = CustomUser
        fields = ["id", "username", "email", "password"]
        read_only_fields = ["id"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        with transaction.atomic():
            # Creamos el usuario
            password = validated_data.pop("password")
            user = CustomUser.objects.create_user(
                username=validated_data["username"].lower(),
                # Ahora sabemos que no será None
                email=validated_data["email"].lower(),
                password=password,
            )

            # Verificamos si ya existe UserPreferences
            if not hasattr(user, "preferences"):
                # Si no existe, creamos el UserPreferences por defecto
                UserPreferences.objects.create(user=user)

            return user


class UserPreferencesSerializer(serializers.ModelSerializer):
    """
    Serializer del modelo UserPreferences
    """

    class Meta:
        model = UserPreferences
        fields = [
            "id",
            "user",
            "favorite_location",
            "alerts_enabled",
            "preferred_units",
        ]
        read_only_fields = ["id", "user"]
