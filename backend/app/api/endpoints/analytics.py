"""
Analytics and Monitoring API endpoints
System metrics, user analytics, and performance monitoring
"""
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
import logging

from app.core.database import get_db
from app.models.models import User, Wall, ShareItem
from app.services.auth_service import get_current_user, require_admin
from app.services.redis_service import redis_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

@router.get("/dashboard", response_model=Dict[str, Any])
async def get_dashboard_metrics(
    days: int = Query(default=7, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user dashboard metrics
    """
    try:
        # Date range
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # User's walls and items
        user_walls = db.query(Wall).filter(Wall.user_id == current_user.id).all()
        wall_ids = [w.id for w in user_walls]
        
        if not wall_ids:
            return {
                "success": True,
                "metrics": {
                    "total_walls": 0,
                    "total_items": 0,
                    "recent_items": 0,
                    "content_types": {},
                    "activity_timeline": [],
                    "popular_tags": []
                }
            }
        
        # Total counts
        total_items = db.query(ShareItem).filter(ShareItem.wall_id.in_(wall_ids)).count()
        recent_items = db.query(ShareItem).filter(
            ShareItem.wall_id.in_(wall_ids),
            ShareItem.created_at >= start_date
        ).count()
        
        # Content type distribution
        content_types = db.query(
            ShareItem.content_type,
            func.count(ShareItem.id).label('count')
        ).filter(
            ShareItem.wall_id.in_(wall_ids)
        ).group_by(ShareItem.content_type).all()
        
        # Activity timeline (daily counts)
        daily_activity = []
        for i in range(days):
            day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i)
            day_end = day_start + timedelta(days=1)
            
            count = db.query(ShareItem).filter(
                ShareItem.wall_id.in_(wall_ids),
                ShareItem.created_at >= day_start,
                ShareItem.created_at < day_end
            ).count()
            
            daily_activity.append({
                "date": day_start.isoformat()[:10],
                "count": count
            })
        
        return {
            "success": True,
            "metrics": {
                "total_walls": len(user_walls),
                "total_items": total_items,
                "recent_items": recent_items,
                "content_types": {ct.content_type: ct.count for ct in content_types},
                "activity_timeline": list(reversed(daily_activity)),
                "popular_tags": []  # TODO: Implement tag extraction
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get dashboard metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/system", response_model=Dict[str, Any])
async def get_system_metrics(
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get system-wide metrics (admin only)
    """
    try:
        # User metrics
        total_users = db.query(User).count()
        active_users = db.query(User).filter(User.is_active == True).count()
        anonymous_users = db.query(User).filter(User.is_anonymous == True).count()
        
        # Content metrics
        total_walls = db.query(Wall).count()
        total_items = db.query(ShareItem).count()
        
        # Recent activity (last 24 hours)
        yesterday = datetime.utcnow() - timedelta(days=1)
        recent_users = db.query(User).filter(User.created_at >= yesterday).count()
        recent_items = db.query(ShareItem).filter(ShareItem.created_at >= yesterday).count()
        
        # Top content types
        content_types = db.query(
            ShareItem.content_type,
            func.count(ShareItem.id).label('count')
        ).group_by(ShareItem.content_type).order_by(desc('count')).limit(10).all()
        
        # Cache statistics
        cache_health = await redis_service.health_check()
        
        return {
            "success": True,
            "system_metrics": {
                "users": {
                    "total": total_users,
                    "active": active_users,
                    "anonymous": anonymous_users,
                    "recent_signups": recent_users
                },
                "content": {
                    "total_walls": total_walls,
                    "total_items": total_items,
                    "recent_items": recent_items,
                    "top_content_types": [
                        {"type": ct.content_type, "count": ct.count}
                        for ct in content_types
                    ]
                },
                "cache": {
                    "available": cache_health,
                    "type": "Redis" if redis_service.connected else "Memory"
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get system metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/usage", response_model=Dict[str, Any])
async def get_usage_analytics(
    days: int = Query(default=30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed usage analytics for user
    """
    try:
        # Date range
        start_date = datetime.utcnow() - timedelta(days=days)
        
        # Get user's walls
        user_walls = db.query(Wall).filter(Wall.user_id == current_user.id).all()
        wall_ids = [w.id for w in user_walls]
        
        if not wall_ids:
            return {
                "success": True,
                "usage": {
                    "sharing_frequency": [],
                    "content_distribution": {},
                    "wall_usage": [],
                    "peak_hours": []
                }
            }
        
        # Weekly sharing frequency
        weekly_data = []
        for i in range(days // 7):
            week_start = datetime.utcnow() - timedelta(weeks=i+1)
            week_end = week_start + timedelta(weeks=1)
            
            count = db.query(ShareItem).filter(
                ShareItem.wall_id.in_(wall_ids),
                ShareItem.created_at >= week_start,
                ShareItem.created_at < week_end
            ).count()
            
            weekly_data.append({
                "week": f"Week {i+1}",
                "shares": count
            })
        
        # Wall usage statistics
        wall_usage = []
        for wall in user_walls:
            item_count = db.query(ShareItem).filter(ShareItem.wall_id == wall.id).count()
            recent_activity = db.query(ShareItem).filter(
                ShareItem.wall_id == wall.id,
                ShareItem.created_at >= start_date
            ).count()
            
            wall_usage.append({
                "wall_id": wall.id,
                "wall_name": wall.name,
                "total_items": item_count,
                "recent_activity": recent_activity,
                "last_updated": wall.updated_at.isoformat()
            })
        
        return {
            "success": True,
            "usage": {
                "sharing_frequency": list(reversed(weekly_data)),
                "content_distribution": {},  # Content type analysis
                "wall_usage": sorted(wall_usage, key=lambda x: x["recent_activity"], reverse=True),
                "peak_hours": []  # Hour-of-day analysis
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get usage analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/performance", response_model=Dict[str, Any])
async def get_performance_metrics(
    admin_user: User = Depends(require_admin)
):
    """
    Get system performance metrics (admin only)
    """
    try:
        import psutil
        import time
        
        # System resources
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Database performance would be implementation-specific
        # For now, return basic system metrics
        
        return {
            "success": True,
            "performance": {
                "system": {
                    "cpu_usage_percent": cpu_percent,
                    "memory_usage_percent": memory.percent,
                    "memory_used_gb": round(memory.used / (1024**3), 2),
                    "memory_total_gb": round(memory.total / (1024**3), 2),
                    "disk_usage_percent": round((disk.used / disk.total) * 100, 2),
                    "disk_free_gb": round(disk.free / (1024**3), 2)
                },
                "cache": {
                    "redis_connected": redis_service.connected,
                    "cache_type": "Redis" if redis_service.connected else "Memory"
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
    except ImportError:
        # psutil not available
        return {
            "success": True,
            "performance": {
                "system": {
                    "message": "System metrics not available (psutil not installed)"
                },
                "cache": {
                    "redis_connected": redis_service.connected,
                    "cache_type": "Redis" if redis_service.connected else "Memory"
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get performance metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))