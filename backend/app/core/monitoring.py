import time
import logging
import json
import functools
from fastapi import Request, Response
from typing import Callable, Dict, Any, Optional, Union

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

logger = logging.getLogger("api.performance")

class PerformanceMonitor:
    """Performance monitoring utilities for API endpoints"""
    
    @staticmethod
    def get_system_metrics() -> Dict[str, float]:
        """Get current system performance metrics"""
        metrics = {}
        
        if PSUTIL_AVAILABLE:
            try:
                metrics["cpu_percent"] = psutil.cpu_percent(interval=None)
                memory = psutil.virtual_memory()
                metrics["memory_used_percent"] = memory.percent
                metrics["memory_available_mb"] = memory.available / (1024 * 1024)
                
                # Disk usage for the main filesystem
                disk = psutil.disk_usage("/")
                metrics["disk_used_percent"] = disk.percent
                
                # Network I/O since last call (first call will be zeros)
                net_io = psutil.net_io_counters()
                metrics["net_bytes_sent"] = net_io.bytes_sent
                metrics["net_bytes_recv"] = net_io.bytes_recv
            except Exception as e:
                logger.warning(f"Error collecting system metrics: {str(e)}")
        
        return metrics
    
    @staticmethod
    def log_request_metrics(
        request: Request,
        response: Response,
        process_time: float,
        extra: Optional[Dict[str, Any]] = None
    ) -> None:
        """Log detailed request performance metrics"""
        try:
            metrics = {
                "path": request.url.path,
                "method": request.method,
                "status_code": response.status_code,
                "client_ip": request.client.host if request.client else "unknown",
                "process_time_ms": round(process_time * 1000, 2),
                "timestamp": time.time(),
            }
            
            # Add system metrics if available
            if PSUTIL_AVAILABLE:
                system_metrics = PerformanceMonitor.get_system_metrics()
                if system_metrics:
                    metrics["system"] = system_metrics
            
            # Add any extra metrics
            if extra:
                metrics.update(extra)
                
            # Log as structured JSON for easier parsing by monitoring tools
            logger.info(f"Request metrics: {json.dumps(metrics)}")
        except Exception as e:
            logger.error(f"Error logging performance metrics: {str(e)}")
    
    @staticmethod
    def monitor_endpoint(func):
        """Decorator to monitor endpoint performance"""
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            
            # Extract request object from args or kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            
            if not request:
                for key, value in kwargs.items():
                    if isinstance(value, Request):
                        request = value
                        break
            
            try:
                # Execute the endpoint function
                result = await func(*args, **kwargs)
                process_time = time.time() - start_time
                
                # Only log metrics if we found the request object
                if request:
                    # Get status code from result if possible
                    status_code = 200
                    if hasattr(result, "status_code"):
                        status_code = result.status_code
                    
                    # Create a synthetic response object for logging
                    response = Response(status_code=status_code)
                    
                    # Log metrics
                    PerformanceMonitor.log_request_metrics(
                        request=request, 
                        response=response,
                        process_time=process_time,
                        extra={
                            "endpoint": func.__name__,
                            "success": True
                        }
                    )
                
                return result
                
            except Exception as e:
                process_time = time.time() - start_time
                
                # Only log metrics if we found the request object
                if request:
                    # Create a synthetic response object for logging
                    response = Response(status_code=500)
                    
                    # Log metrics for failed request
                    PerformanceMonitor.log_request_metrics(
                        request=request, 
                        response=response,
                        process_time=process_time,
                        extra={
                            "endpoint": func.__name__,
                            "success": False,
                            "error": str(e)
                        }
                    )
                
                # Re-raise the exception
                raise
                
        return wrapper 