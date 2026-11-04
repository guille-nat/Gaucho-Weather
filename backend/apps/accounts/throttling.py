from rest_framework.throttling import ScopedRateThrottle


class IPScopedRateThrottle(ScopedRateThrottle):
    """Scoped throttle keyed by client IP even when the request is logged in.

    Register logs the new user in, so keying by user would give every attempt
    a fresh bucket.
    """

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
