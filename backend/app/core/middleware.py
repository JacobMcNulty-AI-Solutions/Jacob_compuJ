from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import time
import logging
from typing import Callable, Dict, Any, Union
import json

from .exceptions import APIError, InvalidFileFormat
from .rate_limiter import RateLimiter

logger = logging.getLogger(__name__)

class TimingMiddleware:
    """
    Middleware to log request timing information and apply rate limiting
    """
    def __init__(self, app, rate_limiter=None):
        self.app = app
        self.rate_limiter = rate_limiter
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        
        start_time = time.time()
        client_ip = self.get_client_ip(scope)
        path = scope.get("path", "")
        method = scope.get("method", "")
        
        # Check rate limit if rate limiter is provided
        if self.rate_limiter and not self.rate_limiter.is_allowed(client_ip):
            # Create a custom response for rate-limited requests
            async def send_rate_limit_response(message):
                if message["type"] == "http.response.start":
                    headers = [(b"content-type", b"application/json")]
                    await send({
                        "type": "http.response.start",
                        "status": 429,
                        "headers": headers
                    })
                elif message["type"] == "http.response.body":
                    body = json.dumps({
                        "status": "error",
                        "error": "RATE_LIMIT_EXCEEDED",
                        "message": "Too many requests. Please try again later."
                    }).encode()
                    await send({
                        "type": "http.response.body",
                        "body": body,
                        "more_body": False
                    })
            
            await send_rate_limit_response({"type": "http.response.start"})
            await send_rate_limit_response({"type": "http.response.body"})
            return
        
        # Wrap the send function to capture the status code
        status_code = None
        
        async def wrapped_send(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)
        
        # Process the request
        try:
            await self.app(scope, receive, wrapped_send)
            
            # Calculate processing time even for errors
            process_time = time.time() - start_time
            
            # Log request information
            logger.info(
                f"{client_ip} - {method} {path} - {status_code} - {process_time:.4f}s"
            )
            
        except Exception as e:
            # Calculate processing time even for errors
            process_time = time.time() - start_time
            
            # Log error with request information
            logger.error(
                f"Error during request: {str(e)} | "
                f"{client_ip} - {method} {path} - {process_time:.4f}s",
                exc_info=True
            )
            
            # Re-raise the exception to be handled by the exception handlers
            raise
    
    def get_client_ip(self, scope):
        """Extract client IP from scope, considering forwarded headers"""
        headers = {
            header[0].decode('utf-8').lower(): header[1].decode('utf-8')
            for header in scope.get("headers", [])
        }
        
        # Try to get IP from headers
        if "x-forwarded-for" in headers:
            return headers["x-forwarded-for"].split(",")[0].strip()
            
        # Fallback to client address from ASGI scope
        client = scope.get("client")
        if client:
            return client[0]
            
        return "unknown"


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    """
    Handler for custom API errors
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.detail
        }
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handler for all other unhandled exceptions
    """
    logger.exception(f"Unhandled exception occurred: {str(exc)}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected error occurred. Please try again later.",
        }
    )

async def invalid_file_format_handler(request: Request, exc: InvalidFileFormat) -> JSONResponse:
    """
    Special handler for file format validation errors to provide better debugging information
    """
    # Log detailed error information
    logger.warning(
        f"File validation failed: {exc.detail}", 
        extra={
            "error_code": exc.error_code,
            "details": exc.details,
            "client_ip": request.client.host if request.client else "unknown",
            "path": request.url.path,
            "method": request.method,
        }
    )
    
    # Add more information to help troubleshoot PDF issues
    if "PDF" in exc.detail or request.url.path == "/api/v1/files/upload/":
        content_type = None
        filename = None
        
        # Try to extract details from the form data
        try:
            form = await request.form()
            if "file" in form:
                file = form["file"]
                content_type = file.content_type
                filename = file.filename
                logger.info(f"Problem file details: type={content_type}, name={filename}")
        except Exception as e:
            logger.warning(f"Could not extract file details from request: {str(e)}")
    
    # Return the standard error response
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.detail,
            "details": exc.details if hasattr(exc, "details") and exc.details else None
        }
    ) 