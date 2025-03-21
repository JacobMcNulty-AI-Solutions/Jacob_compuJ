from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime


class FileBase(BaseModel):
    """Base file model with common attributes"""
    filename: str
    content_type: str


class FileCreate(FileBase):
    """Model for creating a new file"""
    file_content: Optional[str] = None
    file_path: str
    size: Optional[int] = None


class File(FileBase):
    """Complete file model including database fields"""
    id: int
    file_path: str
    content: Optional[str] = None
    size: Optional[int] = None
    uploaded_at: Optional[datetime] = None
    content_hash: Optional[str] = None
    category_prediction: Optional[Dict[str, Any]] = Field(default=None, description="JSON prediction data for file categories")
    
    class Config:
        from_attributes = True


class PaginationInfo(BaseModel):
    """Information about pagination for list responses"""
    total: int = Field(..., description="Total number of items available")
    offset: int = Field(..., description="Current offset in the result set")
    limit: int = Field(..., description="Maximum number of items per page")
    has_more: bool = Field(..., description="Whether there are more results available")


class FileResponse(BaseModel):
    """Standard response model for single file operations"""
    status: str = Field(..., description="Response status (success/error)")
    message: Optional[str] = Field(None, description="Optional message with additional information")
    data: Optional[File] = Field(None, description="File data if available")


class FileList(BaseModel):
    """Standard response model for file list operations"""
    status: str = Field(..., description="Response status (success/error)")
    data: List[File] = Field(..., description="List of file data")
    pagination: PaginationInfo = Field(..., description="Pagination information") 