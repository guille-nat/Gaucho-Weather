from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from .serializers import UserSerializer, UserPreferencesSerializer
from .models import UserPreferences, CustomUser
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import AllowAny, IsAuthenticated
import requests


@api_view(['POST'])
@permission_classes([AllowAny])
def create_users(request):
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_whit_preferences(request):
    """
        Devuelve tanto el user como sus preferencias para los datos del perfil. El usuario debe de estar autenticado.
    """
    user = request.user
    user_serializer = UserSerializer(user)
    try:
        user_preferences = UserPreferences.objects.get(user=user)
        preferences_serializer = UserPreferencesSerializer(user_preferences)
    except UserPreferences.DoesNotExist:
        return Response({"error": "No se encontraron preferencias para el usuario."}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        "user": user_serializer.data,
        "preferences": preferences_serializer.data
    }, status=status.HTTP_200_OK)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_user(request):
    user = request.user
    serializer = UserSerializer(
        instance=user, data=request.data, partial=True)

    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_preferences(request):
    user = request.user  # Obtenemos el usuario autenticado
    preferences_instance = user.preferences  # Accedemos a sus preferencias

    serializer = UserPreferencesSerializer(
        instance=preferences_instance,  # Pasamos la instancia correcta
        data=request.data,
        partial=True
    )

    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
