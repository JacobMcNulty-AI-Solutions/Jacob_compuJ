import time
from typing import Dict, Tuple
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    """
    A simple in-memory rate limiter for API requests.
    
    Attributes:
        rate (int): The maximum number of requests allowed per time period.
        per (int): The time period in seconds.
        clients (Dict[str, Tuple[int, float]]): Dictionary tracking client requests.
    """
    
    def __init__(self, rate: int = 100, per: int = 60):
        """
        Initialize a rate limiter.
        
        Args:
            rate: Maximum number of requests allowed per time period
            per: Time period in seconds
        """
        self.rate = rate
        self.per = per
        self.clients: Dict[str, Tuple[int, float]] = {}
        logger.info(f"Rate limiter initialized: {rate} requests per {per} seconds")
        
    def is_allowed(self, client_id: str) -> bool:
        """
        Check if a client is allowed to make a request.
        
        Args:
            client_id: Unique identifier for the client (e.g., IP address)
            
        Returns:
            bool: True if the request is allowed, False otherwise
        """
        current_time = time.time()
        
        # Remove expired entries (older than 'per' seconds)
        self._cleanup(current_time)
        
        # Get current count and timestamp for client
        if client_id in self.clients:
            count, timestamp = self.clients[client_id]
            
            # If within the current time window
            if current_time - timestamp < self.per:
                # If exceeded rate limit
                if count >= self.rate:
                    return False
                # Increment request count
                self.clients[client_id] = (count + 1, timestamp)
            else:
                # Start a new time window
                self.clients[client_id] = (1, current_time)
        else:
            # First request from this client
            self.clients[client_id] = (1, current_time)
            
        return True
    
    def _cleanup(self, current_time: float) -> None:
        """
        Remove expired entries from the clients dictionary.
        
        Args:
            current_time: Current timestamp
        """
        # This prevents the clients dictionary from growing indefinitely
        expired_time = current_time - self.per
        expired_clients = [
            client_id 
            for client_id, (_, timestamp) in self.clients.items() 
            if timestamp < expired_time
        ]
        
        for client_id in expired_clients:
            del self.clients[client_id] 