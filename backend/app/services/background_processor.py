"""
Background Job Processor
Handles asynchronous content processing tasks
"""
import os
import asyncio
from typing import Dict, Any, Optional
import logging
from celery import Celery
from celery.result import AsyncResult
from app.services.claude_ai import claude_ai
from app.services.r2_storage import r2_storage
from app.services.redis_service import redis_service

logger = logging.getLogger(__name__)

# Celery configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
BROKER_URL = f"{REDIS_URL}/1"  # Use Redis DB 1 for Celery broker
RESULT_BACKEND = f"{REDIS_URL}/2"  # Use Redis DB 2 for results

# Create Celery app
celery_app = Celery(
    'digital_wall_processor',
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=['app.tasks.content_processor']
)

# Celery configuration
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    worker_max_tasks_per_child=1000,
)

# Task routing
celery_app.conf.task_routes = {
    'app.tasks.content_processor.process_shared_content': {'queue': 'content_processing'},
    'app.tasks.content_processor.analyze_content_with_ai': {'queue': 'ai_analysis'},
    'app.tasks.content_processor.optimize_and_store_media': {'queue': 'media_processing'},
}

class BackgroundProcessor:
    """
    Background job processor for content analysis and enhancement
    """
    
    def __init__(self):
        self.celery = celery_app
    
    async def process_shared_content_async(self, content_data: Dict[str, Any]) -> str:
        """
        Queue content processing job
        
        Args:
            content_data: Content data to process
            
        Returns:
            Task ID for tracking
        """
        try:
            # Submit job to Celery
            task = self.celery.send_task(
                'app.tasks.content_processor.process_shared_content',
                args=[content_data],
                queue='content_processing'
            )
            
            logger.info(f"Queued content processing job: {task.id}")
            return task.id
            
        except Exception as e:
            logger.error(f"Failed to queue content processing: {e}")
            raise
    
    async def analyze_content_with_ai_async(self, content_data: Dict[str, Any]) -> str:
        """
        Queue AI analysis job
        
        Args:
            content_data: Content data to analyze
            
        Returns:
            Task ID for tracking
        """
        try:
            task = self.celery.send_task(
                'app.tasks.content_processor.analyze_content_with_ai',
                args=[content_data],
                queue='ai_analysis'
            )
            
            logger.info(f"Queued AI analysis job: {task.id}")
            return task.id
            
        except Exception as e:
            logger.error(f"Failed to queue AI analysis: {e}")
            raise
    
    async def optimize_and_store_media_async(
        self, 
        file_data: bytes, 
        filename: str, 
        content_type: str
    ) -> str:
        """
        Queue media optimization and storage job
        
        Args:
            file_data: File content as bytes
            filename: Original filename
            content_type: MIME type
            
        Returns:
            Task ID for tracking
        """
        try:
            task = self.celery.send_task(
                'app.tasks.content_processor.optimize_and_store_media',
                args=[file_data, filename, content_type],
                queue='media_processing'
            )
            
            logger.info(f"Queued media processing job: {task.id}")
            return task.id
            
        except Exception as e:
            logger.error(f"Failed to queue media processing: {e}")
            raise
    
    def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """
        Get task status and result
        
        Args:
            task_id: Task ID to check
            
        Returns:
            Task status information
        """
        try:
            result = AsyncResult(task_id, app=self.celery)
            
            return {
                'task_id': task_id,
                'status': result.status,
                'result': result.result if result.ready() else None,
                'info': result.info,
                'traceback': result.traceback if result.failed() else None,
                'ready': result.ready(),
                'successful': result.successful() if result.ready() else False,
                'failed': result.failed() if result.ready() else False
            }
            
        except Exception as e:
            logger.error(f"Failed to get task status for {task_id}: {e}")
            return {
                'task_id': task_id,
                'status': 'UNKNOWN',
                'error': str(e)
            }
    
    async def wait_for_task(self, task_id: str, timeout: int = 300) -> Dict[str, Any]:
        """
        Wait for task completion with timeout
        
        Args:
            task_id: Task ID to wait for
            timeout: Maximum wait time in seconds
            
        Returns:
            Task result
        """
        try:
            result = AsyncResult(task_id, app=self.celery)
            
            # Wait for completion with timeout
            task_result = result.get(timeout=timeout)
            
            return {
                'task_id': task_id,
                'status': 'SUCCESS',
                'result': task_result,
                'ready': True,
                'successful': True
            }
            
        except Exception as e:
            logger.error(f"Task {task_id} failed or timed out: {e}")
            return {
                'task_id': task_id,
                'status': 'FAILURE',
                'error': str(e),
                'ready': True,
                'successful': False
            }
    
    def revoke_task(self, task_id: str, terminate: bool = False) -> bool:
        """
        Revoke/cancel a task
        
        Args:
            task_id: Task ID to revoke
            terminate: Whether to terminate the task forcefully
            
        Returns:
            Success status
        """
        try:
            self.celery.control.revoke(task_id, terminate=terminate)
            logger.info(f"Revoked task: {task_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to revoke task {task_id}: {e}")
            return False
    
    def get_queue_stats(self) -> Dict[str, Any]:
        """
        Get queue statistics
        
        Returns:
            Queue statistics
        """
        try:
            inspect = self.celery.control.inspect()
            
            active = inspect.active()
            scheduled = inspect.scheduled()
            reserved = inspect.reserved()
            
            return {
                'active_tasks': active or {},
                'scheduled_tasks': scheduled or {},
                'reserved_tasks': reserved or {},
                'total_active': sum(len(tasks) for tasks in (active or {}).values()),
                'total_scheduled': sum(len(tasks) for tasks in (scheduled or {}).values()),
                'total_reserved': sum(len(tasks) for tasks in (reserved or {}).values())
            }
            
        except Exception as e:
            logger.error(f"Failed to get queue stats: {e}")
            return {'error': str(e)}

# Global instance
background_processor = BackgroundProcessor()

def run_worker():
    """Run Celery worker"""
    celery_app.worker_main([
        'worker',
        '--loglevel=info',
        '--concurrency=2',
        '--queues=content_processing,ai_analysis,media_processing'
    ])

if __name__ == '__main__':
    run_worker()