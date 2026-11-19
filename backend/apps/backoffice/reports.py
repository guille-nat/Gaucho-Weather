"""Backoffice reports (backoffice-superadmin S5-S8): read-only figures and CSV exports.

Mounted at /api/backoffice/informes/ by apps.backoffice.urls. Every view requires
`is_superuser` (IsSuperuser), like the rest of the backoffice.
"""

urlpatterns: list = []
