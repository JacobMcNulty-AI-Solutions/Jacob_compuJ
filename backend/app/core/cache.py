import json
import logging
from typing import Any, Optional, Dict, Union
import time
from functools import wraps

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from app.core.config import settings

logger = logging.getLogger("api.cache")

# Initialize Redis client if available
redis_client = None
if REDIS_AVAILABLE and settings.CACHE_ENABLED:
    try:
        redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            socket_timeout=5,
            decode_responses=True,
        )
        # Test connection
        redis_client.ping()
        logger.info(f"Redis cache initialized at {settings.REDIS_HOST}:{settings.REDIS_PORT}")
    except Exception as e:
        logger.warning(f"Redis connection failed: {str(e)}. Caching will be disabled.")
        redis_client = None


class RedisCache:
    """Redis-based caching for API responses"""
    
    @staticmethod
    def get(key: str) -> Optional[Any]:
        """Get value from cache"""
        if not settings.CACHE_ENABLED or not redis_client:
            return None
            
        try:
            data = redis_client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.error(f"Cache get error: {str(e)}")
            return None
    
    @staticmethod
    def set(key: str, value: Any, expiration: int = None) -> bool:
        """Set value in cache with expiration in seconds"""
        if not settings.CACHE_ENABLED or not redis_client:
            return False
            
        if expiration is None:
            expiration = settings.CACHE_TTL_SECONDS
            
        try:
            serialized = json.dumps(value, default=str)  # Handle non-serializable objects
            return redis_client.setex(key, expiration, serialized)
        except Exception as e:
            logger.error(f"Cache set error: {str(e)}")
            return False
    
    @staticmethod
    def delete(key: str) -> bool:
        """Delete key from cache"""
        if not settings.CACHE_ENABLED or not redis_client:
            return False
            
        try:
            return bool(redis_client.delete(key))
        except Exception as e:
            logger.error(f"Cache delete error: {str(e)}")
            return False
    
    @staticmethod
    def clear_pattern(pattern: str) -> bool:
        """Clear all keys matching pattern"""
        if not settings.CACHE_ENABLED or not redis_client:
            return False
            
        try:
            cursor = 0
            deleted_keys = 0
            
            while True:
                cursor, keys = redis_client.scan(cursor, match=pattern, count=100)
                if keys:
                    deleted_keys += redis_client.delete(*keys)
                if cursor == 0:
                    break
                    
            logger.info(f"Cleared {deleted_keys} keys matching pattern: {pattern}")
            return True
        except Exception as e:
            logger.error(f"Cache clear pattern error: {str(e)}")
            return False


def cached(prefix: str, ttl: int = None, key_builder=None):
    """
    Decorator to cache function results in Redis
    
    Args:
        prefix: Cache key prefix
        ttl: Cache TTL in seconds (overrides settings.CACHE_TTL_SECONDS)
        key_builder: Optional function to build cache key from args and kwargs
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if not settings.CACHE_ENABLED or not redis_client:
                return await func(*args, **kwargs)
            
            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Default key builder concatenates serialized args and kwargs
                key_parts = [prefix, func.__name__]
                
                # Add args to key
                for arg in args:
                    if hasattr(arg, '__dict__'):
                        continue  # Skip complex objects like request
                    key_parts.append(str(arg))
                
                # Add kwargs to key (sorted for consistency)
                for k in sorted(kwargs.keys()):
                    v = kwargs[k]
                    if hasattr(v, '__dict__'):
                        continue  # Skip complex objects
                    key_parts.append(f"{k}:{v}")
                
                cache_key = ":".join(key_parts)
            
            # Try to get from cache
            cached_data = RedisCache.get(cache_key)
            if cached_data is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_data
            
            # Cache miss, execute function
            logger.debug(f"Cache miss: {cache_key}")
            result = await func(*args, **kwargs)
            
            # Store result in cache
            RedisCache.set(cache_key, result, ttl)
            
            return result
        
        return wrapper
    
    return decorator 