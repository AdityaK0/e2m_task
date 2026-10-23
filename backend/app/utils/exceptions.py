class AppException(Exception):
    """Domain error translated to the project's structured JSON error shape."""

    def __init__(self, message: str, status_code: int = 400, error_code: str = "APP_ERROR", **extra):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.extra = extra
