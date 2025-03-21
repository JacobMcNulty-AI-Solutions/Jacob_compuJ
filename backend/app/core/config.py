import os
from typing import Any, Dict, List, Optional

from pydantic import Field, AnyHttpUrl, validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # API settings
    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "Document Classification API"
    DEBUG: bool = Field(default=False, description="Debug mode flag")
    
    # Secret keys
    SECRET_KEY: str = Field(default="development_secret_key", description="Secret key for security")
    
    # Environment
    ENVIRONMENT: str = Field(default="development", description="Current environment (development, staging, production)")
    
    # CORS settings
    CORS_ORIGINS: List[str] = ["*"]
    ALLOWED_HOSTS: List[str] = ["*"]
    
    # Supabase settings
    SUPABASE_URL: str = Field(..., description="Supabase project URL")
    SUPABASE_KEY: str = Field(..., description="Supabase anon/public key")
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = Field(None, description="Supabase service role key for admin operations")
    SUPABASE_STORAGE_BUCKET: str = Field(default="uploaded-files", description="Supabase storage bucket name")
    
    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = Field(default=100, description="Number of requests allowed per minute")
    
    # File upload settings
    MAX_UPLOAD_SIZE: int = Field(default=10 * 1024 * 1024, description="Maximum upload size in bytes (10MB)")
    ALLOWED_UPLOAD_TYPES: List[str] = Field(
        default=["application/pdf", "application/msword", "text/plain", 
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        description="List of allowed MIME types for upload"
    )
    
    # Cache settings
    CACHE_ENABLED: bool = Field(default=True, description="Enable response caching")
    CACHE_TTL_SECONDS: int = Field(default=300, description="Default cache TTL in seconds (5 minutes)")
    REDIS_HOST: str = Field(default="localhost", description="Redis server host")
    REDIS_PORT: int = Field(default=6379, description="Redis server port")
    REDIS_PASSWORD: Optional[str] = Field(default=None, description="Redis server password")
    REDIS_DB: int = Field(default=0, description="Redis database index")
    
    @validator("ENVIRONMENT")
    def validate_environment(cls, v):
        """Validate environment is one of the allowed values"""
        allowed = {"development", "testing", "staging", "production"}
        if v not in allowed:
            raise ValueError(f"Environment must be one of {allowed}")
        return v
        
    @validator("CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str) and v != "":
            return [i.strip() for i in v.split(",")]
        if isinstance(v, list):
            return v
        return ["*"]  # Allow all origins by default
        
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8",
        case_sensitive=True
    )


settings = Settings() 