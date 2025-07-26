"""
Simple Redis Cache Service - Fallback Implementation
Handles caching, sessions when Redis is available, graceful fallback when not
"""
import os
import json
import pickle
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class RedisService:
    """
    Redis service with graceful fallback to memory cache
    """
    
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_db = int(os.getenv("REDIS_DB", "0"))
        self.redis_client = None
        self.connected = False
        
        # Fallback in-memory cache
        self._memory_cache = {}
        
        # Default TTL values (in seconds)
        self.default_ttl = 3600  # 1 hour
        self.session_ttl = 86400 * 30  # 30 days
        self.cache_ttl = 1800  # 30 minutes
        
        # Try to connect to Redis
        self._try_connect()
    
    def _try_connect(self):
        """Try to connect to Redis"""
        try:
            import redis
            self.redis_client = redis.from_url(
                self.redis_url,
                db=self.redis_db,
                decode_responses=True
            )
            # Test connection
            self.redis_client.ping()
            self.connected = True
            logger.info("Connected to Redis")
        except Exception as e:
            logger.warning(f"Redis not available, using memory cache: {e}")
            self.redis_client = None
            self.connected = False
    
    async def health_check(self) -> bool:
        """Check Redis health"""
        if not self.connected or not self.redis_client:
            return False
        
        try:
            self.redis_client.ping()
            return True
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return False
    
    async def cache_set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set cache value"""
        cache_key = f"cache:{key}"
        
        if self.connected and self.redis_client:
            try:
                ttl = ttl or self.cache_ttl
                serialized_value = json.dumps(value) if not isinstance(value, str) else value
                return self.redis_client.setex(cache_key, ttl, serialized_value)
            except Exception as e:
                logger.error(f"Failed to set cache key {key}: {e}")
        
        # Fallback to memory cache
        self._memory_cache[cache_key] = {
            'value': value,
            'expires': datetime.utcnow() + timedelta(seconds=(ttl or self.cache_ttl))
        }
        return True
    
    async def cache_get(self, key: str) -> Any:
        """Get cache value"""
        cache_key = f"cache:{key}"
        
        if self.connected and self.redis_client:
            try:
                value = self.redis_client.get(cache_key)
                if value:
                    try:
                        return json.loads(value)
                    except json.JSONDecodeError:
                        return value
                return None
            except Exception as e:
                logger.error(f"Failed to get cache key {key}: {e}")
        
        # Fallback to memory cache
        if cache_key in self._memory_cache:
            cached_item = self._memory_cache[cache_key]
            if datetime.utcnow() < cached_item['expires']:
                return cached_item['value']
            else:
                # Expired, remove it
                del self._memory_cache[cache_key]
        
        return None
    
    async def cache_delete(self, key: str) -> bool:
        """Delete cache value"""
        cache_key = f"cache:{key}"
        
        if self.connected and self.redis_client:
            try:
                return bool(self.redis_client.delete(cache_key))
            except Exception as e:
                logger.error(f"Failed to delete cache key {key}: {e}")
        
        # Fallback to memory cache
        if cache_key in self._memory_cache:
            del self._memory_cache[cache_key]
            return True
        return False
    
    async def get_keys(self, pattern: str) -> List[str]:
        """Get keys matching pattern"""
        if self.connected and self.redis_client:
            try:
                return self.redis_client.keys(pattern)
            except Exception as e:
                logger.error(f"Failed to get keys for pattern {pattern}: {e}")
        
        # Fallback to memory cache
        import fnmatch
        return [key for key in self._memory_cache.keys() if fnmatch.fnmatch(key, pattern)]
    
    async def delete_pattern(self, pattern: str) -> int:
        """Delete keys matching pattern"""
        if self.connected and self.redis_client:
            try:
                keys = self.redis_client.keys(pattern)
                if keys:
                    return self.redis_client.delete(*keys)
                return 0
            except Exception as e:
                logger.error(f"Failed to delete keys for pattern {pattern}: {e}")
        
        # Fallback to memory cache
        import fnmatch
        keys_to_delete = [key for key in self._memory_cache.keys() if fnmatch.fnmatch(key, pattern)]
        for key in keys_to_delete:
            del self._memory_cache[key]
        return len(keys_to_delete)

# Global instance
redis_service = RedisService()