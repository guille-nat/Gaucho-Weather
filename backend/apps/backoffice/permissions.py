from rest_framework.permissions import BasePermission

SUPERUSERS_ONLY = "Solo los super admins pueden usar el backoffice."


class IsSuperuser(BasePermission):
    """The only gate of the backoffice: a signed-in account with `is_superuser` (S4).

    `is_staff` is not enough: staff may reach parts of the Django admin, but the backoffice
    changes plans and prices for every account.
    """

    message = SUPERUSERS_ONLY

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)
