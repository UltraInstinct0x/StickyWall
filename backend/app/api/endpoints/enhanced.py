"""
Enhanced API endpoints for Phase 3 functionality
Storage, AI analysis, and background job management
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
import logging
import asyncio
from datetime import datetime

from app.services.claude_ai import claude_ai, ContentAnalysis
from app.services.r2_storage import r2_storage
from app.services.redis_service import redis_service
from app.services.background_processor import background_processor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v2", tags=["Enhanced Features"])

@router.post("/analyze", response_model=Dict[str, Any])
async def analyze_content(
    url: Optional[str] = Form(None),
    text: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None
):
    """
    Analyze content using AI with background processing
    """
    try:
        content_data = {
            "url": url,
            "text": text,
            "title": title,
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Check cache first
        cache_key = f"analysis:{hash(str(content_data))}"
        cached_result = await redis_service.cache_get(cache_key)
        
        if cached_result:
            logger.info("Returning cached analysis result")
            return {
                "success": True,
                "analysis": cached_result,
                "cached": True,
                "cache_key": cache_key
            }
        
        # Queue background analysis
        task_id = await background_processor.analyze_content_with_ai_async(content_data)
        
        # Try immediate analysis for quick response
        try:
            immediate_result = await asyncio.wait_for(
                background_processor.wait_for_task(task_id, timeout=5), 
                timeout=5.0
            )
            
            if immediate_result.get('successful'):
                return {
                    "success": True,
                    "analysis": immediate_result['result']['analysis'],
                    "task_id": task_id,
                    "immediate": True
                }
        except asyncio.TimeoutError:
            # Return task ID for polling
            pass
        
        return {
            "success": True,
            "message": "Analysis queued for background processing",
            "task_id": task_id,
            "status_url": f"/api/v2/tasks/{task_id}/status",
            "estimated_time_seconds": 10
        }
        
    except Exception as e:
        logger.error(f"Content analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload", response_model=Dict[str, Any])
async def upload_file(
    file: UploadFile = File(...),
    optimize: bool = Form(True),
    background_tasks: BackgroundTasks = None
):
    """
    Upload and optimize files with Cloudflare R2 storage
    """
    try:
        # Validate file
        if file.size > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=413, detail="File too large (max 10MB)")
        
        # Read file content
        file_content = await file.read()
        
        if optimize and file.content_type.startswith('image/'):
            # Queue optimization job
            task_id = await background_processor.optimize_and_store_media_async(
                file_content, 
                file.filename, 
                file.content_type
            )
            
            return {
                "success": True,
                "message": "File queued for optimization and upload",
                "task_id": task_id,
                "status_url": f"/api/v2/tasks/{task_id}/status",
                "filename": file.filename,
                "content_type": file.content_type,
                "size": len(file_content)
            }
        else:
            # Direct upload
            result = await r2_storage.upload_file(
                file_content, 
                file.filename, 
                file.content_type
            )
            
            if result.get('success'):
                return {
                    "success": True,
                    "message": "File uploaded successfully",
                    "url": result['url'],
                    "key": result['key'],
                    "size": result['size'],
                    "content_type": result['content_type']
                }
            else:
                raise HTTPException(status_code=500, detail=result.get('error', 'Upload failed'))
        
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tasks/{task_id}/status", response_model=Dict[str, Any])
async def get_task_status(task_id: str):
    """
    Get background task status and results
    """
    try:
        status = background_processor.get_task_status(task_id)
        
        if status['status'] == 'UNKNOWN':
            raise HTTPException(status_code=404, detail="Task not found")
        
        return {
            "success": True,
            "task_id": task_id,
            "status": status['status'],
            "ready": status.get('ready', False),
            "successful": status.get('successful', False),
            "result": status.get('result'),
            "info": status.get('info'),
            "error": status.get('error'),
            "traceback": status.get('traceback')
        }
        
    except Exception as e:
        logger.error(f"Failed to get task status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/tasks/{task_id}")
async def cancel_task(task_id: str, terminate: bool = False):
    """
    Cancel a background task
    """
    try:
        success = background_processor.revoke_task(task_id, terminate=terminate)
        
        if success:
            return {
                "success": True,
                "message": f"Task {task_id} cancelled successfully",
                "terminated": terminate
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to cancel task")
        
    except Exception as e:
        logger.error(f"Failed to cancel task: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/queue/stats", response_model=Dict[str, Any])
async def get_queue_stats():
    """
    Get background job queue statistics
    """
    try:
        stats = background_processor.get_queue_stats()
        return {
            "success": True,
            "stats": stats
        }
        
    except Exception as e:
        logger.error(f"Failed to get queue stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/enhance", response_model=Dict[str, Any])
async def enhance_content(
    content: str = Form(...),
    enhancement_type: str = Form("improve"),  # improve, summarize, expand
    background_tasks: BackgroundTasks = None
):
    """
    Enhance content using AI
    """
    try:
        if enhancement_type not in ["improve", "summarize", "expand"]:
            raise HTTPException(
                status_code=400, 
                detail="Invalid enhancement type. Use: improve, summarize, expand"
            )
        
        # Check cache first
        cache_key = f"enhanced:{hash(content)}:{enhancement_type}"
        cached_result = await redis_service.cache_get(cache_key)
        
        if cached_result:
            return {
                "success": True,
                "original": content,
                "enhanced": cached_result['enhanced'],
                "enhancement_type": enhancement_type,
                "cached": True
            }
        
        # Queue enhancement job
        task_id = await background_processor.celery.send_task(
            'app.tasks.content_processor.enhance_content_text',
            args=[content, enhancement_type],
            queue='ai_analysis'
        ).id
        
        return {
            "success": True,
            "message": "Content enhancement queued",
            "task_id": task_id,
            "status_url": f"/api/v2/tasks/{task_id}/status",
            "enhancement_type": enhancement_type
        }
        
    except Exception as e:
        logger.error(f"Content enhancement failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/storage/stats", response_model=Dict[str, Any])
async def get_storage_stats():
    """
    Get storage usage statistics
    """
    try:
        # This would typically query the database for usage stats
        stats = {
            "total_files": 0,
            "total_size_bytes": 0,
            "storage_provider": "Cloudflare R2" if r2_storage.client else "Local Storage",
            "optimization_enabled": True,
            "cdn_enabled": bool(r2_storage.cdn_domain)
        }
        
        return {
            "success": True,
            "stats": stats
        }
        
    except Exception as e:
        logger.error(f"Failed to get storage stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ai/health", response_model=Dict[str, Any])
async def get_ai_health():
    """
    Check AI service health and capabilities
    """
    try:
        health_info = {
            "claude_ai_available": claude_ai.client is not None,
            "model": claude_ai.model if claude_ai.client else None,
            "rate_limit_requests_per_minute": claude_ai.rate_limit_requests_per_minute,
            "current_request_count": len(claude_ai._request_timestamps),
            "features": {
                "content_analysis": True,
                "content_enhancement": True,
                "sentiment_analysis": True,
                "categorization": True,
                "tag_extraction": True
            }
        }
        
        return {
            "success": True,
            "ai_health": health_info
        }
        
    except Exception as e:
        logger.error(f"Failed to get AI health: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cache/stats", response_model=Dict[str, Any])
async def get_cache_stats():
    """
    Get cache statistics and health
    """
    try:
        redis_health = await redis_service.health_check()
        
        # Get some basic cache stats
        cache_keys = await redis_service.get_keys("cache:*")
        session_keys = await redis_service.get_keys("session:*")
        queue_keys = await redis_service.get_keys("queue:*")
        
        return {
            "success": True,
            "cache_health": redis_health,
            "stats": {
                "cache_entries": len(cache_keys),
                "active_sessions": len(session_keys),
                "queue_entries": len(queue_keys),
                "total_keys": len(cache_keys) + len(session_keys) + len(queue_keys)
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cache/clear")
async def clear_cache(pattern: str = "cache:*"):
    """
    Clear cache entries matching pattern
    """
    try:
        deleted = await redis_service.delete_pattern(pattern)
        
        return {
            "success": True,
            "message": f"Cleared {deleted} cache entries",
            "pattern": pattern,
            "deleted_count": deleted
        }
        
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))