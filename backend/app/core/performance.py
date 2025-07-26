"""
Performance optimization utilities
Caching, lazy loading, query optimization
"""
import asyncio
import time
from functools import wraps
from typing import Any, Callable, Optional, Dict, List
import logging
import hashlib
import json
from datetime import datetime, timedelta

from app.services.redis_service import redis_service

logger = logging.getLogger(__name__)

def cache_result(ttl: int = 300, key_prefix: str = "cache"):
    """
    Decorator for caching function results
    
    Args:
        ttl: Time to live in seconds
        key_prefix: Cache key prefix
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            cache_key = _generate_cache_key(func.__name__, args, kwargs, key_prefix)
            
            # Try to get from cache
            cached_result = await redis_service.cache_get(cache_key)
            if cached_result is not None:
                logger.debug(f"Cache hit for {cache_key}")
                return cached_result
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            await redis_service.cache_set(cache_key, result, ttl)
            
            logger.debug(f"Cache miss for {cache_key}, result cached")
            return result
        
        return wrapper
    return decorator

def _generate_cache_key(func_name: str, args: tuple, kwargs: dict, prefix: str) -> str:
    """Generate cache key from function name and arguments"""
    # Create a hash of the arguments
    args_str = json.dumps(args, sort_keys=True, default=str)
    kwargs_str = json.dumps(kwargs, sort_keys=True, default=str)
    combined = f"{func_name}:{args_str}:{kwargs_str}"
    
    # Create SHA256 hash for consistent key length
    hash_key = hashlib.sha256(combined.encode()).hexdigest()[:16]
    
    return f"{prefix}:{func_name}:{hash_key}"

class PerformanceMonitor:
    """
    Performance monitoring and metrics collection
    """
    
    def __init__(self):
        self.metrics = {}
        self.slow_query_threshold = 1.0  # 1 second
    
    def timing_decorator(self, operation_name: str):
        """Decorator to measure operation timing"""
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            async def wrapper(*args, **kwargs):
                start_time = time.time()
                
                try:
                    result = await func(*args, **kwargs)
                    execution_time = time.time() - start_time
                    
                    # Record metrics
                    await self._record_timing(operation_name, execution_time, True)
                    
                    # Log slow operations
                    if execution_time > self.slow_query_threshold:
                        logger.warning(f"Slow operation {operation_name}: {execution_time:.3f}s")
                    
                    return result
                    
                except Exception as e:
                    execution_time = time.time() - start_time
                    await self._record_timing(operation_name, execution_time, False)
                    raise
            
            return wrapper
        return decorator
    
    async def _record_timing(self, operation: str, duration: float, success: bool):
        """Record timing metrics in Redis"""
        try:
            timestamp = datetime.utcnow().strftime("%Y-%m-%d-%H")
            metrics_key = f"metrics:{operation}:{timestamp}"
            
            # Get existing metrics
            current_metrics = await redis_service.get(metrics_key) or {
                "count": 0,
                "total_time": 0,
                "min_time": float('inf'),
                "max_time": 0,
                "errors": 0
            }
            
            # Update metrics
            current_metrics["count"] += 1
            current_metrics["total_time"] += duration
            current_metrics["min_time"] = min(current_metrics["min_time"], duration)
            current_metrics["max_time"] = max(current_metrics["max_time"], duration)
            current_metrics["avg_time"] = current_metrics["total_time"] / current_metrics["count"]
            
            if not success:
                current_metrics["errors"] += 1
            
            # Store updated metrics (expire after 24 hours)
            await redis_service.set(metrics_key, current_metrics, ttl=86400)
            
        except Exception as e:
            logger.error(f"Failed to record timing metrics: {e}")
    
    async def get_performance_stats(self, operation: str, hours: int = 24) -> Dict:
        """Get performance statistics for an operation"""
        try:
            stats = {
                "operation": operation,
                "total_requests": 0,
                "total_errors": 0,
                "avg_response_time": 0,
                "min_response_time": float('inf'),
                "max_response_time": 0
            }
            
            # Get metrics for the last N hours
            current_time = datetime.utcnow()
            for i in range(hours):
                hour = (current_time - timedelta(hours=i)).strftime("%Y-%m-%d-%H")
                metrics_key = f"metrics:{operation}:{hour}"
                
                hour_metrics = await redis_service.get(metrics_key)
                if hour_metrics:
                    stats["total_requests"] += hour_metrics["count"]
                    stats["total_errors"] += hour_metrics.get("errors", 0)
                    stats["min_response_time"] = min(stats["min_response_time"], hour_metrics["min_time"])
                    stats["max_response_time"] = max(stats["max_response_time"], hour_metrics["max_time"])
            
            # Calculate average
            if stats["total_requests"] > 0:
                stats["error_rate"] = stats["total_errors"] / stats["total_requests"]
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get performance stats: {e}")
            return {"error": str(e)}

class BatchProcessor:
    """
    Batch processing for improved performance
    """
    
    def __init__(self, batch_size: int = 100, max_wait_time: float = 5.0):
        self.batch_size = batch_size
        self.max_wait_time = max_wait_time
        self.pending_items = []
        self.last_batch_time = time.time()
    
    async def add_item(self, item: Any, processor: Callable):
        """Add item to batch for processing"""
        self.pending_items.append((item, processor))
        
        # Process batch if we hit size limit or time limit
        if (len(self.pending_items) >= self.batch_size or
            time.time() - self.last_batch_time > self.max_wait_time):
            await self._process_batch()
    
    async def _process_batch(self):
        """Process pending batch items"""
        if not self.pending_items:
            return
        
        items_to_process = self.pending_items.copy()
        self.pending_items.clear()
        self.last_batch_time = time.time()
        
        # Group items by processor function
        processor_groups = {}
        for item, processor in items_to_process:
            if processor not in processor_groups:
                processor_groups[processor] = []
            processor_groups[processor].append(item)
        
        # Process each group
        tasks = []
        for processor, items in processor_groups.items():
            task = asyncio.create_task(processor(items))
            tasks.append(task)
        
        # Wait for all processors to complete
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        
        logger.info(f"Processed batch of {len(items_to_process)} items")
    
    async def flush(self):
        """Force process any pending items"""
        await self._process_batch()

class DatabaseOptimizer:
    """
    Database query optimization utilities
    """
    
    @staticmethod
    def optimize_pagination(page: int, per_page: int, max_per_page: int = 100):
        """Optimize pagination parameters"""
        page = max(1, int(page))
        per_page = min(max_per_page, max(1, int(per_page)))
        offset = (page - 1) * per_page
        
        return page, per_page, offset
    
    @staticmethod
    def build_search_query(search_terms: str, fields: List[str]) -> str:
        """Build optimized search query"""
        if not search_terms or not fields:
            return ""
        
        # Split search terms and clean them
        terms = [term.strip() for term in search_terms.split() if term.strip()]
        
        # Build ILIKE conditions for each field and term combination
        conditions = []
        for field in fields:
            for term in terms:
                conditions.append(f"{field} ILIKE '%{term}%'")
        
        return " OR ".join(conditions)
    
    @staticmethod
    def get_cache_key_for_query(query: str, params: dict) -> str:
        """Generate cache key for database query"""
        query_hash = hashlib.md5(query.encode()).hexdigest()[:8]
        params_hash = hashlib.md5(json.dumps(params, sort_keys=True).encode()).hexdigest()[:8]
        return f"db_query:{query_hash}:{params_hash}"

class AssetOptimizer:
    """
    Asset optimization utilities
    """
    
    @staticmethod
    def optimize_image_dimensions(width: int, height: int, max_width: int = 1200) -> tuple:
        """Calculate optimized image dimensions"""
        if width <= max_width:
            return width, height
        
        aspect_ratio = height / width
        new_width = max_width
        new_height = int(max_width * aspect_ratio)
        
        return new_width, new_height
    
    @staticmethod
    def get_webp_support_header() -> dict:
        """Get headers for WebP support detection"""
        return {
            "Accept": "image/webp,image/avif,image/*,*/*;q=0.8",
            "Cache-Control": "public, max-age=31536000"
        }
    
    @staticmethod
    def generate_responsive_sizes(base_width: int) -> List[int]:
        """Generate responsive image sizes"""
        sizes = []
        current = base_width
        
        while current >= 300:
            sizes.append(current)
            current = int(current * 0.75)  # 75% of previous size
        
        return sorted(set(sizes))

class MemoryOptimizer:
    """
    Memory usage optimization
    """
    
    @staticmethod
    def chunk_list(items: List[Any], chunk_size: int = 1000) -> List[List[Any]]:
        """Split large list into smaller chunks"""
        for i in range(0, len(items), chunk_size):
            yield items[i:i + chunk_size]
    
    @staticmethod
    async def process_in_chunks(items: List[Any], processor: Callable, chunk_size: int = 100):
        """Process large list in chunks to avoid memory issues"""
        results = []
        
        for chunk in MemoryOptimizer.chunk_list(items, chunk_size):
            chunk_results = await processor(chunk)
            results.extend(chunk_results)
            
            # Small delay to prevent overwhelming the system
            await asyncio.sleep(0.01)
        
        return results

# Global instances
performance_monitor = PerformanceMonitor()
batch_processor = BatchProcessor()
database_optimizer = DatabaseOptimizer()
asset_optimizer = AssetOptimizer()
memory_optimizer = MemoryOptimizer()