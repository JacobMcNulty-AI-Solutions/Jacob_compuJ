from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import time
import logging

from app.api.api import api_router
from app.core.config import settings
from app.core.exceptions import APIError, InvalidFileFormat
from app.core.middleware import TimingMiddleware, api_error_handler, general_exception_handler, invalid_file_format_handler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)

logger = logging.getLogger(__name__)

# Create the FastAPI app with metadata
app = FastAPI(
    title="Document Classification API",
    description="""
    This API provides document classification services.
    Upload text documents to automatically categorize them based on content.
    
    Features:
    - Document upload and storage
    - Text extraction from various file formats
    - Automatic document classification
    - Document retrieval and management
    
    Authentication is required for all endpoints.
    """,
    version="1.0.0",
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
)

# Add middleware for CORS with proper configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a simple rate limiter class in case the original is not available
class SimpleRateLimiter:
    def __init__(self, rate=100, per=60):
        self.rate = rate
        self.per = per
        self.tokens = {}
        
    def is_allowed(self, key):
        return True  # Simple implementation allows all requests

# Add timing middleware with a simple rate limiter
app.add_middleware(TimingMiddleware, rate_limiter=SimpleRateLimiter())

# Add trusted host middleware
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=settings.ALLOWED_HOSTS
)

# Register exception handlers
app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(InvalidFileFormat, invalid_file_format_handler)
app.add_exception_handler(Exception, general_exception_handler)

# Include routers
app.include_router(api_router, prefix="/api/v1")

@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check():
    """
    Health check endpoint to verify the API is running
    """
    return {
        "status": "success",
        "api": "document-classifier",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }

@app.get("/", include_in_schema=False)
async def root():
    """
    Root endpoint that redirects to the API documentation
    """
    return {
        "status": "success",
        "message": "Welcome to the Document Classification API",
        "documentation": "/api/docs",
        "health_check": "/health"
    }

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True) 