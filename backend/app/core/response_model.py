from typing import Generic, TypeVar, Optional, Dict, Any
from pydantic import BaseModel

T = TypeVar('T')

class ResponseModel(BaseModel, Generic[T]):
    """
    Standardized response model for API endpoints.
    
    This model provides a consistent structure for all API responses,
    with status, optional message, and typed data field.
    """
    status: str
    message: Optional[str] = None
    data: Optional[T] = None
    
    @classmethod
    def success(cls, data: Any = None, message: Optional[str] = None) -> 'ResponseModel':
        """
        Create a success response with the given data and optional message.
        
        Args:
            data: The data to include in the response
            message: Optional success message
            
        Returns:
            ResponseModel instance with status "success"
        """
        return cls(
            status="success",
            message=message,
            data=data
        )
    
    @classmethod
    def error(cls, message: str, error_code: Optional[str] = None, details: Optional[Dict] = None) -> 'ResponseModel':
        """
        Create an error response with the given message, error code, and details.
        
        Args:
            message: Error message describing what went wrong
            error_code: Optional error code for client identification
            details: Optional dictionary with additional error details
            
        Returns:
            ResponseModel instance with status "error"
        """
        data = {"error": error_code} if error_code else {}
        if details:
            data["details"] = details
            
        return cls(
            status="error",
            message=message,
            data=data
        ) 