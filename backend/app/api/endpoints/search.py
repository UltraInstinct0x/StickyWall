"""
Search and Content Discovery API endpoints
Full-text search, filtering, and content discovery features
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
import logging

from app.core.database import get_db
from app.models.models import User, Wall, ShareItem
from app.services.auth_service import get_current_user
from app.services.redis_service import redis_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["Search"])

@router.get("/", response_model=Dict[str, Any])
async def search_content(
    q: str = Query(..., description="Search query"),
    content_type: Optional[str] = Query(None, description="Filter by content type"),
    wall_id: Optional[int] = Query(None, description="Search within specific wall"),
    limit: int = Query(default=20, le=100, description="Maximum results to return"),
    offset: int = Query(default=0, description="Results offset for pagination"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Search user's content across all walls or within a specific wall
    """
    try:
        # Build base query for user's content
        query = db.query(ShareItem).join(Wall).filter(Wall.user_id == current_user.id)
        
        # Apply search filters
        search_conditions = []
        
        # Text search in title, text content, and URL
        if q:
            search_term = f"%{q.lower()}%"
            search_conditions.append(
                or_(
                    ShareItem.title.ilike(search_term),
                    ShareItem.text.ilike(search_term),
                    ShareItem.url.ilike(search_term)
                )
            )
        
        # Content type filter
        if content_type:
            search_conditions.append(ShareItem.content_type == content_type)
        
        # Wall filter
        if wall_id:
            # Verify user owns the wall
            wall = db.query(Wall).filter(
                Wall.id == wall_id,
                Wall.user_id == current_user.id
            ).first()
            
            if not wall:
                raise HTTPException(status_code=404, detail="Wall not found")
            
            search_conditions.append(ShareItem.wall_id == wall_id)
        
        # Apply all conditions
        if search_conditions:
            query = query.filter(and_(*search_conditions))
        
        # Get total count for pagination
        total_count = query.count()
        
        # Apply pagination and ordering
        results = query.order_by(ShareItem.created_at.desc()).offset(offset).limit(limit).all()
        
        # Format results
        search_results = []
        for item in results:
            result = {
                "id": item.id,
                "title": item.title,
                "text": item.text,
                "url": item.url,
                "content_type": item.content_type,
                "wall_id": item.wall_id,
                "wall_name": item.wall.name,
                "created_at": item.created_at.isoformat(),
                "metadata": item.item_metadata or {}
            }
            search_results.append(result)
        
        # Cache search results for quick subsequent access
        cache_key = f"search:{current_user.id}:{hash(f'{q}{content_type}{wall_id}{offset}{limit}')}"
        await redis_service.cache_set(cache_key, search_results, ttl=300)  # 5 minutes
        
        return {
            "success": True,
            "query": q,
            "filters": {
                "content_type": content_type,
                "wall_id": wall_id
            },
            "pagination": {
                "total": total_count,
                "offset": offset,
                "limit": limit,
                "has_more": offset + limit < total_count
            },
            "results": search_results,
            "search_time_ms": 0  # Would be calculated in production
        }
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/suggestions", response_model=Dict[str, Any])
async def get_search_suggestions(
    q: str = Query(..., min_length=2, description="Partial search query"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get search suggestions based on partial query
    """
    try:
        # Check cache first
        cache_key = f"suggestions:{current_user.id}:{hash(q.lower())}"
        cached_suggestions = await redis_service.cache_get(cache_key)
        
        if cached_suggestions:
            return {
                "success": True,
                "query": q,
                "suggestions": cached_suggestions,
                "cached": True
            }
        
        # Build suggestions from user's content
        search_term = f"%{q.lower()}%"
        
        # Get title suggestions
        title_suggestions = db.query(ShareItem.title).join(Wall).filter(
            Wall.user_id == current_user.id,
            ShareItem.title.ilike(search_term),
            ShareItem.title.isnot(None)
        ).distinct().limit(5).all()
        
        # Get content type suggestions
        content_type_suggestions = db.query(ShareItem.content_type).join(Wall).filter(
            Wall.user_id == current_user.id,
            ShareItem.content_type.ilike(search_term)
        ).distinct().limit(3).all()
        
        # Format suggestions
        suggestions = {
            "titles": [t[0] for t in title_suggestions if t[0]],
            "content_types": [ct[0] for ct in content_type_suggestions if ct[0]],
            "recent_searches": []  # TODO: Implement search history
        }
        
        # Cache suggestions
        await redis_service.cache_set(cache_key, suggestions, ttl=600)  # 10 minutes
        
        return {
            "success": True,
            "query": q,
            "suggestions": suggestions,
            "cached": False
        }
        
    except Exception as e:
        logger.error(f"Search suggestions failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/popular", response_model=Dict[str, Any])
async def get_popular_content(
    timeframe: str = Query(default="week", regex="^(day|week|month|all)$"),
    content_type: Optional[str] = Query(None),
    limit: int = Query(default=10, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get popular/trending content from user's walls
    """
    try:
        from datetime import datetime, timedelta
        
        # Calculate timeframe
        now = datetime.utcnow()
        timeframe_map = {
            "day": now - timedelta(days=1),
            "week": now - timedelta(weeks=1),
            "month": now - timedelta(days=30),
            "all": datetime.min
        }
        
        start_date = timeframe_map.get(timeframe, timeframe_map["week"])
        
        # Base query for user's content
        query = db.query(ShareItem).join(Wall).filter(
            Wall.user_id == current_user.id,
            ShareItem.created_at >= start_date
        )
        
        # Apply content type filter
        if content_type:
            query = query.filter(ShareItem.content_type == content_type)
        
        # For now, "popularity" is based on recency
        # In production, you'd factor in views, shares, engagement, etc.
        popular_items = query.order_by(
            ShareItem.created_at.desc()
        ).limit(limit).all()
        
        # Format results
        results = []
        for item in popular_items:
            result = {
                "id": item.id,
                "title": item.title,
                "url": item.url,
                "content_type": item.content_type,
                "wall_name": item.wall.name,
                "created_at": item.created_at.isoformat(),
                "popularity_score": 1.0  # Placeholder
            }
            results.append(result)
        
        return {
            "success": True,
            "timeframe": timeframe,
            "content_type": content_type,
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        logger.error(f"Popular content query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/filters", response_model=Dict[str, Any])
async def get_search_filters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get available search filters based on user's content
    """
    try:
        # Get available content types
        content_types = db.query(ShareItem.content_type, func.count(ShareItem.id)).join(Wall).filter(
            Wall.user_id == current_user.id,
            ShareItem.content_type.isnot(None)
        ).group_by(ShareItem.content_type).all()
        
        # Get user's walls
        walls = db.query(Wall.id, Wall.name, func.count(ShareItem.id)).outerjoin(ShareItem).filter(
            Wall.user_id == current_user.id
        ).group_by(Wall.id, Wall.name).all()
        
        return {
            "success": True,
            "filters": {
                "content_types": [
                    {"type": ct[0], "count": ct[1]} 
                    for ct in content_types
                ],
                "walls": [
                    {"id": w[0], "name": w[1], "item_count": w[2]}
                    for w in walls
                ],
                "date_ranges": [
                    {"label": "Last 24 hours", "value": "day"},
                    {"label": "Last week", "value": "week"},
                    {"label": "Last month", "value": "month"},
                    {"label": "All time", "value": "all"}
                ]
            }
        }
        
    except Exception as e:
        logger.error(f"Get search filters failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save", response_model=Dict[str, Any])
async def save_search(
    query: str,
    name: str,
    filters: Dict[str, Any] = {},
    current_user: User = Depends(get_current_user)
):
    """
    Save a search query for quick access
    """
    try:
        # Save search to user's saved searches
        saved_searches_key = f"saved_searches:{current_user.id}"
        
        # Get existing saved searches
        saved_searches = await redis_service.cache_get(saved_searches_key) or []
        
        # Add new search
        new_search = {
            "id": len(saved_searches) + 1,
            "name": name,
            "query": query,
            "filters": filters,
            "created_at": datetime.utcnow().isoformat(),
            "last_used": None
        }
        
        saved_searches.append(new_search)
        
        # Save updated list (keep only last 10)
        await redis_service.cache_set(
            saved_searches_key, 
            saved_searches[-10:], 
            ttl=86400 * 30  # 30 days
        )
        
        return {
            "success": True,
            "message": "Search saved successfully",
            "search": new_search
        }
        
    except Exception as e:
        logger.error(f"Save search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/saved", response_model=Dict[str, Any])
async def get_saved_searches(current_user: User = Depends(get_current_user)):
    """
    Get user's saved searches
    """
    try:
        saved_searches_key = f"saved_searches:{current_user.id}"
        saved_searches = await redis_service.cache_get(saved_searches_key) or []
        
        return {
            "success": True,
            "saved_searches": saved_searches
        }
        
    except Exception as e:
        logger.error(f"Get saved searches failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))