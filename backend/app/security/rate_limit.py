import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        default_limit: tuple[int, int],
        route_limits: dict[str, tuple[int, int]] | None = None,
    ) -> None:
        super().__init__(app)
        self.default_limit = default_limit
        self.route_limits = route_limits or {}
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        limit, window_seconds = self.limit_for_path(request.url.path)
        key = self.key_for_request(request)
        now = time.monotonic()
        bucket = self.hits[key]

        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()

        if len(bucket) >= limit:
            return Response(
                "Rate limit exceeded",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(window_seconds)},
            )

        bucket.append(now)
        return await call_next(request)

    def limit_for_path(self, path: str) -> tuple[int, int]:
        for prefix, limit in self.route_limits.items():
            if path.startswith(prefix):
                return limit
        return self.default_limit

    def key_for_request(self, request: Request) -> str:
        authorization = request.headers.get("authorization", "")
        if authorization:
            return authorization[:256]

        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",", 1)[0].strip()

        return request.client.host if request.client else "unknown"
