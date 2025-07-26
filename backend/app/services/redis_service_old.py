"""
Redis Cache Service
Handles caching, sessions, and background job queuing
"""
import os
import json
import pickle
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta
import logging
import redis
import asyncio

logger = logging.getLogger(__name__)

class RedisService:
    """
    Redis service for caching, sessions, and job queuing
    """
    
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_db = int(os.getenv("REDIS_DB", "0"))
        self.redis_client = None
        self.connected = False
        
        # Default TTL values (in seconds)
        self.default_ttl = 3600  # 1 hour
        self.session_ttl = 86400 * 30  # 30 days
        self.cache_ttl = 1800  # 30 minutes
        
        # Initialize connection
        try:
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
            logger.warning(f"Redis not available: {e}")
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
        if not self.connected or not self.redis_client:
            return False
        
        try:
            ttl = ttl or self.cache_ttl
            serialized_value = json.dumps(value) if not isinstance(value, str) else value
            return self.redis_client.setex(f"cache:{key}", ttl, serialized_value)
        except Exception as e:
            logger.error(f"Failed to set cache key {key}: {e}")
            return False
    
    async def cache_get(self, key: str) -> Any:
        """Get cache value"""
        if not self.connected or not self.redis_client:
            return None
        
        try:
            value = self.redis_client.get(f"cache:{key}")
            if value:
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value
            return None
        except Exception as e:
            logger.error(f"Failed to get cache key {key}: {e}")
            return None
    
    async def cache_delete(self, key: str) -> bool:
        """Delete cache value"""
        if not self.connected or not self.redis_client:
            return False
        
        try:
            return bool(self.redis_client.delete(f"cache:{key}"))
        except Exception as e:
            logger.error(f"Failed to delete cache key {key}: {e}")
            return False
    
    async def get_keys(self, pattern: str) -> List[str]:
        """Get keys matching pattern"""
        if not self.connected or not self.redis_client:
            return []
        
        try:
            return self.redis_client.keys(pattern)
        except Exception as e:
            logger.error(f"Failed to get keys for pattern {pattern}: {e}")
            return []
    
    async def delete_pattern(self, pattern: str) -> int:
        """Delete keys matching pattern"""
        if not self.connected or not self.redis_client:
            return 0
        
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                return self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Failed to delete keys for pattern {pattern}: {e}")
            return 0
        if not self.connected or not self.redis:
            await self.connect()
        
        if not self.connected:
            raise ConnectionError("Redis not available")
    
    # Basic Key-Value Operations
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a key-value pair with optional TTL"""
        try:
            await self._ensure_connected()
            
            # Serialize complex objects
            if isinstance(value, (dict, list, tuple)):
                value = json.dumps(value)
            elif not isinstance(value, (str, int, float, bool)):
                value = pickle.dumps(value)
                key = f"pickle:{key}"  # Mark as pickled
            
            if ttl:
                await self.redis.setex(key, ttl, value)
            else:
                await self.redis.set(key, value)
            
            return True
            
        except Exception as e:
            logger.error(f"Redis SET failed for key {key}: {e}")
            return False
    
    async def get(self, key: str) -> Any:
        """Get value by key"""
        try:
            await self._ensure_connected()
            
            value = await self.redis.get(key)
            if value is None:
                return None
            
            # Handle pickled objects
            if key.startswith("pickle:"):
                return pickle.loads(value)
            
            # Try to deserialize JSON
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
            
        except Exception as e:
            logger.error(f"Redis GET failed for key {key}: {e}")
            return None
    
    async def delete(self, key: str) -> bool:
        """Delete a key"""
        try:
            await self._ensure_connected()
            result = await self.redis.delete(key)
            return result > 0
        except Exception as e:
            logger.error(f"Redis DELETE failed for key {key}: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            await self._ensure_connected()
            return bool(await self.redis.exists(key))
        except Exception as e:
            logger.error(f"Redis EXISTS failed for key {key}: {e}")
            return False
    
    # Caching Operations
    
    async def cache_set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set cached value with cache-specific prefix"""
        cache_key = f"cache:{key}"
        ttl = ttl or self.cache_ttl
        return await self.set(cache_key, value, ttl)
    
    async def cache_get(self, key: str) -> Any:
        """Get cached value"""
        cache_key = f"cache:{key}"
        return await self.get(cache_key)
    
    async def cache_delete(self, key: str) -> bool:
        """Delete cached value"""
        cache_key = f"cache:{key}"
        return await self.delete(cache_key)
    
    # Session Management
    
    async def set_session(self, session_id: str, data: Dict[str, Any], ttl: Optional[int] = None) -> bool:
        """Set session data"""
        session_key = f"session:{session_id}"
        ttl = ttl or self.session_ttl
        return await self.set(session_key, data, ttl)
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data"""
        session_key = f"session:{session_id}"
        return await self.get(session_key)
    
    async def delete_session(self, session_id: str) -> bool:
        """Delete session"""
        session_key = f"session:{session_id}"
        return await self.delete(session_key)
    
    async def extend_session(self, session_id: str, ttl: Optional[int] = None) -> bool:
        """Extend session TTL"""
        try:
            await self._ensure_connected()
            session_key = f"session:{session_id}"
            ttl = ttl or self.session_ttl
            return bool(await self.redis.expire(session_key, ttl))
        except Exception as e:
            logger.error(f"Failed to extend session {session_id}: {e}")
            return False
    
    # List Operations
    
    async def list_push(self, key: str, *values: Any) -> int:
        """Push values to list (left push)"""
        try:
            await self._ensure_connected()
            
            # Serialize complex objects
            serialized_values = []
            for value in values:
                if isinstance(value, (dict, list, tuple)):
                    serialized_values.append(json.dumps(value))
                else:
                    serialized_values.append(str(value))
            
            return await self.redis.lpush(key, *serialized_values)
            
        except Exception as e:
            logger.error(f"Redis LPUSH failed for key {key}: {e}")
            return 0
    
    async def list_pop(self, key: str) -> Any:
        """Pop value from list (right pop)"""
        try:
            await self._ensure_connected()
            value = await self.redis.rpop(key)
            
            if value is None:
                return None
            
            # Try to deserialize JSON
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
                
        except Exception as e:
            logger.error(f"Redis RPOP failed for key {key}: {e}")
            return None
    
    async def list_length(self, key: str) -> int:
        """Get list length"""
        try:
            await self._ensure_connected()
            return await self.redis.llen(key)
        except Exception as e:
            logger.error(f"Redis LLEN failed for key {key}: {e}")
            return 0
    
    # Set Operations
    
    async def set_add(self, key: str, *values: Any) -> int:
        """Add values to set"""
        try:
            await self._ensure_connected()
            serialized_values = [
                json.dumps(v) if isinstance(v, (dict, list, tuple)) else str(v)
                for v in values
            ]
            return await self.redis.sadd(key, *serialized_values)
        except Exception as e:
            logger.error(f"Redis SADD failed for key {key}: {e}")
            return 0
    
    async def set_is_member(self, key: str, value: Any) -> bool:
        """Check if value is in set"""
        try:
            await self._ensure_connected()
            serialized_value = json.dumps(value) if isinstance(value, (dict, list, tuple)) else str(value)
            return await self.redis.sismember(key, serialized_value)
        except Exception as e:
            logger.error(f"Redis SISMEMBER failed for key {key}: {e}")
            return False
    
    # Job Queue Operations
    
    async def enqueue_job(self, queue: str, job_data: Dict[str, Any], priority: int = 0) -> bool:
        """Enqueue a background job"""
        try:
            job_payload = {
                'id': f"job_{datetime.utcnow().timestamp()}_{hash(str(job_data))}",
                'data': job_data,
                'priority': priority,
                'created_at': datetime.utcnow().isoformat(),
                'status': 'pending'
            }
            
            queue_key = f"queue:{queue}"
            return await self.list_push(queue_key, job_payload) > 0
            
        except Exception as e:
            logger.error(f"Failed to enqueue job: {e}")
            return False
    
    async def dequeue_job(self, queue: str) -> Optional[Dict[str, Any]]:
        """Dequeue a background job"""
        queue_key = f"queue:{queue}"
        return await self.list_pop(queue_key)
    
    async def get_queue_length(self, queue: str) -> int:
        """Get queue length"""
        queue_key = f"queue:{queue}"
        return await self.list_length(queue_key)
    
    # Analytics and Metrics
    
    async def increment_counter(self, key: str, amount: int = 1) -> int:
        """Increment counter"""
        try:
            await self._ensure_connected()
            return await self.redis.incrby(key, amount)
        except Exception as e:
            logger.error(f"Redis INCRBY failed for key {key}: {e}")
            return 0
    
    async def get_counter(self, key: str) -> int:
        """Get counter value"""
        try:
            value = await self.get(key)
            return int(value) if value is not None else 0
        except (ValueError, TypeError):
            return 0
    
    # Pattern Operations
    
    async def get_keys(self, pattern: str) -> List[str]:
        """Get keys matching pattern"""
        try:
            await self._ensure_connected()
            return await self.redis.keys(pattern)
        except Exception as e:
            logger.error(f"Redis KEYS failed for pattern {pattern}: {e}")
            return []
    
    async def delete_pattern(self, pattern: str) -> int:
        """Delete keys matching pattern"""
        try:
            keys = await self.get_keys(pattern)
            if keys:
                return await self.redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Failed to delete pattern {pattern}: {e}")
            return 0
    
    # Health Check
    
    async def health_check(self) -> Dict[str, Any]:
        """Check Redis health"""
        try:
            await self._ensure_connected()
            
            start_time = datetime.utcnow()
            await self.redis.ping()
            response_time = (datetime.utcnow() - start_time).total_seconds() * 1000
            
            info = await self.redis.info()
            
            return {
                'status': 'healthy',
                'connected': True,
                'response_time_ms': round(response_time, 2),
                'memory_used': info.get('used_memory_human', 'unknown'),
                'connections': info.get('connected_clients', 0),
                'uptime_seconds': info.get('uptime_in_seconds', 0)
            }
            
        except Exception as e:
            return {
                'status': 'unhealthy',
                'connected': False,
                'error': str(e)
            }

# Global instance
redis_service = RedisService()

# Async context manager for Redis operations
class RedisContext:
    async def __aenter__(self):
        await redis_service.connect()
        return redis_service
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await redis_service.disconnect()