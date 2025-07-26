"""
Celery Tasks for Content Processing with Real-time Updates
"""
import asyncio
import logging
import json
from typing import Dict, Any, Optional
from celery import Celery
from app.services.claude_ai import claude_ai
from app.services.r2_storage import r2_storage
from app.services.redis_service import redis_service
import os

logger = logging.getLogger(__name__)

# Get Celery app configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
BROKER_URL = f"{REDIS_URL}/1"
RESULT_BACKEND = f"{REDIS_URL}/2"

# Create Celery app for tasks
celery_app = Celery(
    'digital_wall_tasks',
    broker=BROKER_URL,
    backend=RESULT_BACKEND
)

def run_async(coro):
    """Helper to run async functions in Celery tasks"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(coro)

async def send_processing_update(user_id: str, share_id: str, progress: int, status: str, message: str = ""):
    """Send real-time processing updates via Redis pub/sub"""
    try:
        update_data = {
            'type': 'processing_update',
            'user_id': user_id,
            'share_id': share_id,
            'progress': progress,
            'status': status,
            'message': message,
            'timestamp': asyncio.get_event_loop().time()
        }
        
        # Publish to Redis for WebSocket manager to pick up
        await redis_service.publish('processing_updates', json.dumps(update_data))
    except Exception as e:
        logger.error(f"Failed to send processing update: {e}")

@celery_app.task(bind=True, name='app.tasks.content_processor.process_shared_content')
def process_shared_content(self, content_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process shared content with AI analysis and storage
    
    Args:
        content_data: Content information including user_id, share_id, etc.
        
    Returns:
        Processing results
    """
    try:
        user_id = content_data.get('user_id')
        share_id = content_data.get('share_id', 'unknown')
        
        logger.info(f"Processing shared content: {content_data.get('url', 'N/A')}")
        
        # Send initial processing update
        run_async(send_processing_update(user_id, share_id, 10, 'processing', 'Starting content analysis...'))
        
        # Update progress
        self.update_state(state='PROGRESS', meta={'progress': 10, 'status': 'Content analysis started'})
        
        # Update task status
        self.update_state(state='PROGRESS', meta={'status': 'Starting content processing'})
        
        # Run AI analysis
        analysis_result = run_async(claude_ai.analyze_content(content_data))
        
        if analysis_result:
            # Update task status
            self.update_state(state='PROGRESS', meta={'status': 'AI analysis complete'})
            
            # Cache analysis result
            cache_key = f"analysis:{hash(str(content_data))}"
            run_async(redis_service.cache_set(cache_key, analysis_result.dict(), ttl=3600))
            
            # Store in database (this would typically update the database)
            result = {
                'success': True,
                'analysis': analysis_result.dict(),
                'cache_key': cache_key,
                'processed_at': content_data.get('created_at')
            }
            
            logger.info(f"Successfully processed content: {content_data.get('url', 'N/A')}")
            return result
        else:
            logger.warning("AI analysis failed, using fallback")
            return {
                'success': False,
                'error': 'AI analysis failed',
                'fallback_used': True
            }
        
    except Exception as e:
        logger.error(f"Content processing failed: {e}")
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise

@celery_app.task(bind=True, name='app.tasks.content_processor.analyze_content_with_ai')
def analyze_content_with_ai(self, content_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze content using Claude AI
    
    Args:
        content_data: Content to analyze
        
    Returns:
        AI analysis results
    """
    try:
        logger.info("Starting AI content analysis")
        
        self.update_state(state='PROGRESS', meta={'status': 'Connecting to Claude AI'})
        
        # Run AI analysis
        analysis = run_async(claude_ai.analyze_content(content_data))
        
        if analysis:
            self.update_state(state='PROGRESS', meta={'status': 'Analysis complete'})
            
            result = {
                'success': True,
                'analysis': analysis.dict(),
                'model_used': claude_ai.model,
                'processed_at': content_data.get('created_at')
            }
            
            # Cache the result
            cache_key = f"ai_analysis:{hash(str(content_data))}"
            run_async(redis_service.cache_set(cache_key, result, ttl=1800))
            
            logger.info("AI analysis completed successfully")
            return result
        else:
            logger.warning("AI analysis returned no results")
            return {
                'success': False,
                'error': 'No analysis results',
                'fallback_available': True
            }
        
    except Exception as e:
        logger.error(f"AI analysis task failed: {e}")
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise

@celery_app.task(bind=True, name='app.tasks.content_processor.optimize_and_store_media')
def optimize_and_store_media(self, file_data: bytes, filename: str, content_type: str) -> Dict[str, Any]:
    """
    Optimize and store media files
    
    Args:
        file_data: File content as bytes
        filename: Original filename
        content_type: MIME type
        
    Returns:
        Storage results
    """
    try:
        logger.info(f"Processing media file: {filename}")
        
        self.update_state(state='PROGRESS', meta={'status': 'Optimizing media'})
        
        # Optimize image if it's an image file
        optimized_data = file_data
        if content_type.startswith('image/'):
            optimized_data = run_async(r2_storage.optimize_image(file_data))
            logger.info("Image optimization complete")
        
        self.update_state(state='PROGRESS', meta={'status': 'Uploading to storage'})
        
        # Upload to R2 storage
        upload_result = run_async(r2_storage.upload_file(
            optimized_data, 
            filename, 
            content_type,
            metadata={'optimized': content_type.startswith('image/')}
        ))
        
        if upload_result.get('success'):
            self.update_state(state='PROGRESS', meta={'status': 'Upload complete'})
            
            result = {
                'success': True,
                'url': upload_result['url'],
                'key': upload_result['key'],
                'size': upload_result['size'],
                'content_type': upload_result['content_type'],
                'optimized': content_type.startswith('image/'),
                'hash': upload_result.get('hash'),
                'processed_at': content_data.get('created_at') if 'content_data' in locals() else None
            }
            
            # Cache upload result
            cache_key = f"media_upload:{upload_result['key']}"
            run_async(redis_service.cache_set(cache_key, result, ttl=7200))
            
            logger.info(f"Successfully processed and uploaded media: {filename}")
            return result
        else:
            logger.error(f"Media upload failed: {upload_result.get('error')}")
            return {
                'success': False,
                'error': upload_result.get('error', 'Upload failed'),
                'fallback': upload_result.get('fallback')
            }
        
    except Exception as e:
        logger.error(f"Media processing task failed: {e}")
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise

@celery_app.task(bind=True, name='app.tasks.content_processor.enhance_content_text')
def enhance_content_text(self, content: str, enhancement_type: str = 'improve') -> Dict[str, Any]:
    """
    Enhance content text using AI
    
    Args:
        content: Original content text
        enhancement_type: Type of enhancement
        
    Returns:
        Enhanced content results
    """
    try:
        logger.info(f"Enhancing content text ({enhancement_type})")
        
        self.update_state(state='PROGRESS', meta={'status': f'Enhancing content ({enhancement_type})'})
        
        # Enhance content using Claude AI
        enhanced = run_async(claude_ai.enhance_content(content, enhancement_type))
        
        if enhanced and enhanced != content:
            result = {
                'success': True,
                'original': content,
                'enhanced': enhanced,
                'enhancement_type': enhancement_type,
                'improvement_ratio': len(enhanced) / len(content) if content else 1.0,
                'processed_at': content_data.get('created_at') if 'content_data' in locals() else None
            }
            
            # Cache enhancement result
            cache_key = f"enhanced:{hash(content)}:{enhancement_type}"
            run_async(redis_service.cache_set(cache_key, result, ttl=3600))
            
            logger.info("Content enhancement completed successfully")
            return result
        else:
            logger.info("No enhancement applied (content unchanged)")
            return {
                'success': True,
                'original': content,
                'enhanced': content,
                'enhancement_type': enhancement_type,
                'no_change': True
            }
        
    except Exception as e:
        logger.error(f"Content enhancement task failed: {e}")
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise

@celery_app.task(name='app.tasks.content_processor.cleanup_cache')
def cleanup_cache() -> Dict[str, Any]:
    """
    Clean up expired cache entries
    
    Returns:
        Cleanup results
    """
    try:
        logger.info("Starting cache cleanup")
        
        # Get patterns to clean
        patterns_to_clean = [
            'cache:*',
            'ai_analysis:*',
            'media_upload:*',
            'enhanced:*'
        ]
        
        total_deleted = 0
        
        for pattern in patterns_to_clean:
            deleted = run_async(redis_service.delete_pattern(pattern))
            total_deleted += deleted
            logger.info(f"Deleted {deleted} keys matching pattern: {pattern}")
        
        result = {
            'success': True,
            'total_deleted': total_deleted,
            'patterns_cleaned': patterns_to_clean,
            'cleaned_at': content_data.get('created_at') if 'content_data' in locals() else None
        }
        
        logger.info(f"Cache cleanup completed: {total_deleted} keys deleted")
        return result
        
    except Exception as e:
        logger.error(f"Cache cleanup task failed: {e}")
        raise

# Register tasks with the main Celery app
def register_tasks(main_celery_app):
    """Register tasks with the main Celery application"""
    main_celery_app.tasks.register(process_shared_content)
    main_celery_app.tasks.register(analyze_content_with_ai)
    main_celery_app.tasks.register(optimize_and_store_media)
    main_celery_app.tasks.register(enhance_content_text)
    main_celery_app.tasks.register(cleanup_cache)