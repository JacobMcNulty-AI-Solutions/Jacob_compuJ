from typing import Optional, Dict, Any, TypeVar, Generic
from pydantic import BaseModel, Field
from pydantic.generics import GenericModel

T = TypeVar('T')

class ApiResponse(GenericModel, Generic[T]):
    """Generic API response model that can be used for any data type"""
    status: str = Field(..., description="Response status: success or error")
    message: Optional[str] = Field(None, description="Optional message about the operation")
    data: Optional[T] = Field(None, description="Response data payload")

def create_response(status: str = "success", message: Optional[str] = None, data: Any = None) -> Dict[str, Any]:
    """
    Helper function to create a standardized API response
    
    Args:
        status: Response status ("success" or "error")
        message: Optional message about the operation
        data: Response data payload
        
    Returns:
        Dictionary containing the API response
    """
    response = {
        "status": status,
    }
    
    if message is not None:
        response["message"] = message
        
    if data is not None:
        response["data"] = data
        
    return response 