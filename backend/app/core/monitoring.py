"""
Production monitoring and health checks
System metrics, error tracking, alerting
"""
import asyncio
import psutil
import time
from datetime import datetime
from typing import Dict, List, Any
import logging
import sys
import os
from pathlib import Path

from app.services.redis_service import redis_service
from app.services.claude_ai import claude_ai
from app.services.r2_storage import r2_storage
from app.core.database import engine

logger = logging.getLogger(__name__)

class SystemMonitor:
    """
    System health and performance monitoring
    """
    
    def __init__(self):
        self.start_time = time.time()
        self.request_count = 0
        self.error_count = 0
    
    async def get_system_health(self) -> Dict[str, Any]:
        """
        Get comprehensive system health status
        """
        try:
            health_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "status": "healthy",
                "uptime_seconds": int(time.time() - self.start_time),
                "version": "2.0.0",
                "environment": os.getenv("ENVIRONMENT", "development"),
                "services": {},
                "system": {},
                "performance": {}
            }
            
            # Check individual services
            health_data["services"] = await self._check_services()
            
            # Get system metrics
            health_data["system"] = self._get_system_metrics()
            
            # Get performance metrics  
            health_data["performance"] = await self._get_performance_metrics()
            
            # Determine overall health status
            service_statuses = [s.get("status") for s in health_data["services"].values()]
            if any(status == "unhealthy" for status in service_statuses):
                health_data["status"] = "degraded"
            
            return health_data
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "status": "unhealthy",
                "error": str(e)
            }
    
    async def _check_services(self) -> Dict[str, Any]:
        """Check health of external services"""
        services = {}
        
        # Database health
        try:
            with engine.connect() as conn:
                conn.execute("SELECT 1")
            services["database"] = {
                "status": "healthy",
                "type": "postgresql",
                "response_time_ms": 0  # Would measure actual response time
            }
        except Exception as e:
            services["database"] = {
                "status": "unhealthy",
                "error": str(e)
            }
        
        # Redis health
        try:
            redis_health = await redis_service.health_check()
            services["redis"] = redis_health
        except Exception as e:
            services["redis"] = {
                "status": "unhealthy",
                "error": str(e)
            }
        
        # AI service health
        services["ai"] = {
            "status": "healthy" if claude_ai.client else "unavailable",
            "provider": "anthropic_claude",
            "model": claude_ai.model if claude_ai.client else None
        }
        
        # Storage service health
        services["storage"] = {
            "status": "healthy" if r2_storage.client else "local_fallback",
            "provider": "cloudflare_r2" if r2_storage.client else "local",
            "cdn_enabled": bool(r2_storage.cdn_domain)
        }
        
        return services
    
    def _get_system_metrics(self) -> Dict[str, Any]:
        """Get system resource metrics"""
        try:
            return {
                "cpu_percent": psutil.cpu_percent(interval=1),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_percent": psutil.disk_usage('/').percent,
                "load_average": os.getloadavg() if hasattr(os, 'getloadavg') else None,
                "process_count": len(psutil.pids()),
                "python_version": sys.version,
                "platform": sys.platform
            }
        except Exception as e:
            logger.error(f"Failed to get system metrics: {e}")
            return {"error": str(e)}
    
    async def _get_performance_metrics(self) -> Dict[str, Any]:
        """Get application performance metrics"""
        try:
            return {
                "total_requests": self.request_count,
                "total_errors": self.error_count,
                "error_rate": self.error_count / max(self.request_count, 1),
                "average_response_time_ms": 0,  # Would track actual response times
                "active_connections": 0,  # Would track active database connections
                "queue_size": await self._get_queue_size()
            }
        except Exception as e:
            logger.error(f"Failed to get performance metrics: {e}")
            return {"error": str(e)}
    
    async def _get_queue_size(self) -> int:
        """Get background job queue size"""
        try:
            # Get queue lengths for all queues
            queues = ["content_processing", "ai_analysis", "media_processing"]
            total_size = 0
            
            for queue_name in queues:
                size = await redis_service.get_queue_length(queue_name)
                total_size += size
            
            return total_size
        except Exception:
            return 0
    
    def increment_request_count(self):
        """Increment request counter"""
        self.request_count += 1
    
    def increment_error_count(self):
        """Increment error counter"""
        self.error_count += 1

class AlertManager:
    """
    Alert management and notification system
    """
    
    def __init__(self):
        self.alert_thresholds = {
            "cpu_percent": 80,
            "memory_percent": 85,
            "disk_percent": 90,
            "error_rate": 0.05,  # 5%
            "queue_size": 1000
        }
        self.alert_cooldown = 300  # 5 minutes between similar alerts
    
    async def check_and_alert(self, health_data: Dict[str, Any]):
        """
        Check metrics against thresholds and send alerts
        """
        try:
            alerts = []
            
            # Check system metrics
            system = health_data.get("system", {})
            for metric, threshold in self.alert_thresholds.items():
                if metric in system and system[metric] > threshold:
                    alerts.append({
                        "type": "system_alert",
                        "metric": metric,
                        "value": system[metric],
                        "threshold": threshold,
                        "severity": "high" if system[metric] > threshold * 1.2 else "medium"
                    })
            
            # Check service health
            services = health_data.get("services", {})
            for service_name, service_data in services.items():
                if service_data.get("status") == "unhealthy":
                    alerts.append({
                        "type": "service_alert",
                        "service": service_name,
                        "status": service_data.get("status"),
                        "error": service_data.get("error"),
                        "severity": "critical"
                    })
            
            # Process alerts
            for alert in alerts:
                await self._process_alert(alert)
            
            return alerts
            
        except Exception as e:
            logger.error(f"Alert checking failed: {e}")
            return []
    
    async def _process_alert(self, alert: Dict[str, Any]):
        """
        Process and potentially send an alert
        """
        alert_key = f"alert:{alert['type']}:{alert.get('metric', alert.get('service', 'unknown'))}"
        
        # Check if we've already sent this alert recently (cooldown)
        last_alert_time = await redis_service.get(alert_key)
        current_time = time.time()
        
        if last_alert_time and (current_time - float(last_alert_time)) < self.alert_cooldown:
            return  # Skip due to cooldown
        
        # Store alert timestamp
        await redis_service.set(alert_key, str(current_time), ttl=self.alert_cooldown * 2)
        
        # Log alert
        severity = alert.get("severity", "medium")
        logger.critical(f"ALERT [{severity.upper()}]: {alert}")
        
        # In production, this would send to monitoring services like:
        # - Slack/Discord webhooks
        # - Email notifications
        # - PagerDuty/OpsGenie
        # - Monitoring dashboards
        
        await self._send_alert_notification(alert)
    
    async def _send_alert_notification(self, alert: Dict[str, Any]):
        """
        Send alert notification (placeholder for actual implementation)
        """
        # Placeholder for actual notification logic
        notification_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "alert": alert,
            "system": "Digital Wall MVP",
            "environment": os.getenv("ENVIRONMENT", "development")
        }
        
        # Store notification in Redis for webhook processing
        notification_key = f"notification:{int(time.time())}"
        await redis_service.set(notification_key, notification_data, ttl=86400)
        
        logger.info(f"Alert notification queued: {notification_key}")

class MetricsCollector:
    """
    Metrics collection for monitoring dashboards
    """
    
    def __init__(self):
        self.metrics_retention_days = 30
    
    async def collect_metrics(self, health_data: Dict[str, Any]):
        """
        Collect and store metrics for monitoring dashboards
        """
        try:
            timestamp = datetime.utcnow().strftime("%Y-%m-%d-%H-%M")
            metrics_key = f"metrics:system:{timestamp}"
            
            # Extract key metrics
            metrics = {
                "timestamp": datetime.utcnow().isoformat(),
                "cpu_percent": health_data.get("system", {}).get("cpu_percent", 0),
                "memory_percent": health_data.get("system", {}).get("memory_percent", 0),
                "disk_percent": health_data.get("system", {}).get("disk_percent", 0),
                "request_count": health_data.get("performance", {}).get("total_requests", 0),
                "error_count": health_data.get("performance", {}).get("total_errors", 0),
                "queue_size": health_data.get("performance", {}).get("queue_size", 0),
                "service_status": {
                    name: service.get("status", "unknown")
                    for name, service in health_data.get("services", {}).items()
                }
            }
            
            # Store metrics with TTL
            ttl = self.metrics_retention_days * 24 * 3600
            await redis_service.set(metrics_key, metrics, ttl=ttl)
            
            logger.debug(f"Metrics collected: {metrics_key}")
            
        except Exception as e:
            logger.error(f"Metrics collection failed: {e}")
    
    async def get_metrics_history(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Get metrics history for the specified number of hours
        """
        try:
            history = []
            current_time = datetime.utcnow()
            
            for i in range(hours * 60):  # Every minute
                time_point = current_time - timedelta(minutes=i)
                timestamp = time_point.strftime("%Y-%m-%d-%H-%M")
                metrics_key = f"metrics:system:{timestamp}"
                
                metrics_data = await redis_service.get(metrics_key)
                if metrics_data:
                    history.append(metrics_data)
            
            return sorted(history, key=lambda x: x["timestamp"])
            
        except Exception as e:
            logger.error(f"Failed to get metrics history: {e}")
            return []

class GracefulShutdown:
    """
    Graceful shutdown handler
    """
    
    def __init__(self):
        self.shutdown_timeout = 30  # seconds
        self.is_shutting_down = False
    
    async def shutdown(self):
        """
        Perform graceful shutdown
        """
        if self.is_shutting_down:
            return
        
        self.is_shutting_down = True
        logger.info("Starting graceful shutdown...")
        
        try:
            # Stop accepting new requests (would be handled by load balancer)
            
            # Wait for ongoing requests to complete
            await asyncio.sleep(2)
            
            # Flush pending background jobs
            # batch_processor.flush() - if implemented
            
            # Close database connections
            # engine.dispose() - if needed
            
            # Close Redis connections
            await redis_service.disconnect()
            
            logger.info("Graceful shutdown completed")
            
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")

# Global instances
system_monitor = SystemMonitor()
alert_manager = AlertManager()
metrics_collector = MetricsCollector()
graceful_shutdown = GracefulShutdown()

# Monitoring middleware
async def monitoring_middleware(request, call_next):
    """
    Middleware to track requests and performance
    """
    start_time = time.time()
    system_monitor.increment_request_count()
    
    try:
        response = await call_next(request)
        
        # Log successful request
        duration = time.time() - start_time
        if duration > 1.0:  # Log slow requests
            logger.warning(f"Slow request: {request.url.path} took {duration:.3f}s")
        
        return response
        
    except Exception as e:
        system_monitor.increment_error_count()
        logger.error(f"Request failed: {request.url.path} - {str(e)}")
        raise