import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.modules.auth.api import auth_router
from app.modules.customers.api import customers_router
from app.modules.dashboard.api import dashboard_router
from app.modules.insights.api import insights_router
from app.modules.interactions.api import interactions_router
from app.modules.users.api import users_router
from app.utils.exceptions import AppException

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("app")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="AI-powered Customer Success Platform: customers, interactions, AI meeting insights, RBAC, Redis caching, and PostgreSQL-backed dashboards.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-CSRF-Token",
            "X-Requested-With",
        ],
        expose_headers=["X-Request-ID"],
    )

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        content = {
            "success": False,
            "message": exc.message,
            "error_code": exc.error_code,
        }
        if exc.extra:
            content.update(exc.extra)
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = [
            {
                "field": ".".join(str(part) for part in error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "message": "Request validation failed",
                "error_code": "VALIDATION_ERROR",
                "errors": errors,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": message,
                "error_code": f"HTTP_{exc.status_code}",
            },
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "Internal server error",
                "error_code": "INTERNAL_SERVER_ERROR",
            },
        )

    @app.get("/health", tags=["Health"])
    def health() -> dict:
        return {"status": "ok", "service": settings.APP_NAME, "env": settings.APP_ENV}

    app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
    app.include_router(users_router, prefix=settings.API_V1_PREFIX)
    app.include_router(customers_router, prefix=settings.API_V1_PREFIX)
    app.include_router(interactions_router, prefix=settings.API_V1_PREFIX)
    app.include_router(insights_router, prefix=settings.API_V1_PREFIX)
    app.include_router(dashboard_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()
