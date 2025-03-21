from fastapi import HTTPException, status
from typing import Optional, Dict, Any

class APIError(HTTPException):
    """Base exception class for API errors"""
    def __init__(
        self, 
        status_code: int, 
        detail: str, 
        error_code: str = "ERROR", 
        headers: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        self.error_code = error_code
        self.details = details
        super().__init__(status_code=status_code, detail=detail, headers=headers)


class RateLimitExceeded(APIError):
    """Raised when a client exceeds the rate limit"""
    def __init__(self, detail: str = "Rate limit exceeded. Please try again later."):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            error_code="RATE_LIMIT_EXCEEDED"
        )


class DocumentNotFound(APIError):
    """Raised when a requested document is not found"""
    def __init__(self, document_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID {document_id} not found",
            error_code="DOCUMENT_NOT_FOUND"
        )


class InvalidFileFormat(APIError):
    """Raised when an uploaded file has an invalid format"""
    def __init__(self, detail: str = "Invalid file format", error_code: str = "INVALID_FILE_FORMAT", details: dict = None):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            error_code=error_code,
            details=details
        )


class StorageError(APIError):
    """Raised when there is an error storing or retrieving files from storage"""
    def __init__(self, detail: str = "Error with storage service", error_code: str = "STORAGE_ERROR", details: dict = None):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code=error_code,
            details=details
        )


class DatabaseError(APIError):
    """Raised when there's an error with database operations"""
    def __init__(self, detail: str = "Database operation failed", error_code: str = "DATABASE_ERROR", details: dict = None):
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
            error_code=error_code,
            details=details
        )


class UnauthorizedAccess(APIError):
    """Raised when a user tries to access a resource they're not authorized for"""
    def __init__(self, detail: str = "You are not authorized to access this resource"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
            error_code="UNAUTHORIZED_ACCESS"
        ) 