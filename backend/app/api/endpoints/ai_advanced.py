"""
Advanced AI Features API - Smart Content Analysis and Recommendations
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import logging

from app.services.claude_ai import claude_ai
from app.services.auth_service import get_current_user_optional
from app.core.database import get_db_session
from app.models.models import ShareItem, User
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["advanced-ai"])

class ContentInsightRequest(BaseModel):
    content: Dict[str, Any]
    user_context: Optional[Dict[str, Any]] = None

class ContentInsightResponse(BaseModel):
    insights: List[Dict[str, Any]]
    relevance_score: float
    learning_potential: float
    actionability: float
    time_investment: str
    recommended_action: str
    related_topics: List[str]
    difficulty_level: str

class BatchAnalysisRequest(BaseModel):
    content_items: List[Dict[str, Any]]
    include_clustering: bool = False

class BatchAnalysisResponse(BaseModel):
    analyses: List[Dict[str, Any]]
    clusters: Optional[Dict[str, List[int]]] = None
    processing_time_seconds: float

class SmartTagRequest(BaseModel):
    content: str
    existing_tags: Optional[List[str]] = None

class RecommendationRequest(BaseModel):
    user_id: Optional[str] = None
    num_recommendations: int = Field(default=5, ge=1, le=20)

@router.post("/insights", response_model=ContentInsightResponse)
async def get_content_insights(
    request: ContentInsightRequest,
    current_user = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Generate advanced AI insights for a piece of content
    """
    try:
        # Get user context if user is authenticated
        user_context = request.user_context or {}
        if current_user:
            # Fetch user's recent content preferences
            recent_items = await db.execute(
                select(ShareItem)
                .where(ShareItem.user_id == current_user.id)
                .order_by(ShareItem.created_at.desc())
                .limit(10)
            )
            recent_content = recent_items.scalars().all()
            
            user_context.update({
                "recent_categories": [item.metadata.get("category", "other") for item in recent_content if item.metadata],
                "interests": list(set(tag for item in recent_content if item.metadata for tag in item.metadata.get("tags", []))),
                "experience_level": "intermediate"  # This could be determined from content complexity
            })
        
        # Generate insights using Claude AI
        insights = await claude_ai.generate_content_insights(request.content, user_context)
        
        return ContentInsightResponse(**insights)
        
    except Exception as e:
        logger.error(f"Error generating content insights: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate content insights")

@router.post("/batch-analyze", response_model=BatchAnalysisResponse)
async def batch_analyze_content(
    request: BatchAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user = Depends(get_current_user_optional)
):
    """
    Analyze multiple content items in batch for efficiency
    """
    try:
        import time
        start_time = time.time()
        
        # Perform batch analysis
        analyses = await claude_ai.analyze_content_batch(request.content_items)
        
        # Convert ContentAnalysis objects to dicts
        analysis_dicts = [analysis.dict() for analysis in analyses]
        
        # Generate clusters if requested
        clusters = None
        if request.include_clustering and len(request.content_items) > 1:
            clusters = await claude_ai.cluster_content_by_similarity(request.content_items)
        
        processing_time = time.time() - start_time
        
        return BatchAnalysisResponse(
            analyses=analysis_dicts,
            clusters=clusters,
            processing_time_seconds=round(processing_time, 2)
        )
        
    except Exception as e:
        logger.error(f"Error in batch analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to perform batch analysis")

@router.post("/smart-tags")
async def generate_smart_tags(
    request: SmartTagRequest,
    current_user = Depends(get_current_user_optional)
):
    """
    Generate intelligent, contextually relevant tags for content
    """
    try:
        smart_tags = await claude_ai.generate_smart_tags(
            request.content,
            request.existing_tags
        )
        
        return {
            "status": "success",
            "tags": smart_tags,
            "count": len(smart_tags)
        }
        
    except Exception as e:
        logger.error(f"Error generating smart tags: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate smart tags")

@router.post("/recommendations")
async def get_content_recommendations(
    request: RecommendationRequest,
    current_user = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Generate personalized content recommendations based on user history
    """
    try:
        # Determine user ID
        user_id = request.user_id or (current_user.id if current_user else None)
        
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID required for recommendations")
        
        # Fetch user's content history
        result = await db.execute(
            select(ShareItem)
            .where(ShareItem.user_id == user_id)
            .order_by(ShareItem.created_at.desc())
            .limit(50)  # Last 50 items for analysis
        )
        content_history = result.scalars().all()
        
        if not content_history:
            return {
                "status": "success",
                "recommendations": [],
                "message": "No content history available for recommendations"
            }
        
        # Convert to format expected by AI service
        history_data = []
        for item in content_history:
            history_data.append({
                "title": item.title,
                "category": item.metadata.get("category", "other") if item.metadata else "other",
                "tags": item.metadata.get("tags", []) if item.metadata else [],
                "url": item.url,
                "created_at": item.created_at.isoformat()
            })
        
        # Generate recommendations
        recommendations = await claude_ai.generate_content_recommendations(
            history_data,
            request.num_recommendations
        )
        
        return {
            "status": "success",
            "recommendations": recommendations,
            "based_on_items": len(content_history)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate recommendations")

@router.post("/enhance-content")
async def enhance_content(
    content: str,
    enhancement_type: str = "improve",
    current_user = Depends(get_current_user_optional)
):
    """
    Enhance content using AI (improve readability, summarize, or expand)
    """
    try:
        if enhancement_type not in ["improve", "summarize", "expand"]:
            raise HTTPException(status_code=400, detail="Invalid enhancement type")
        
        enhanced_content = await claude_ai.enhance_content(content, enhancement_type)
        
        return {
            "status": "success",
            "original_content": content,
            "enhanced_content": enhanced_content,
            "enhancement_type": enhancement_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enhancing content: {e}")
        raise HTTPException(status_code=500, detail="Failed to enhance content")

@router.post("/cluster-content")
async def cluster_user_content(
    user_id: Optional[str] = None,
    limit: int = 50,
    current_user = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session)
):
    """
    Cluster user's content by similarity for better organization
    """
    try:
        # Determine user ID
        target_user_id = user_id or (current_user.id if current_user else None)
        
        if not target_user_id:
            raise HTTPException(status_code=400, detail="User ID required")
        
        # Only allow users to cluster their own content unless admin
        if current_user and current_user.id != target_user_id:
            # Add admin check here if needed
            pass
        
        # Fetch user's content
        result = await db.execute(
            select(ShareItem)
            .where(ShareItem.user_id == target_user_id)
            .order_by(ShareItem.created_at.desc())
            .limit(limit)
        )
        content_items = result.scalars().all()
        
        if len(content_items) < 2:
            return {
                "status": "success",
                "clusters": {},
                "message": "Need at least 2 content items for clustering"
            }
        
        # Convert to format for clustering
        content_data = []
        for item in content_items:
            content_data.append({
                "id": str(item.id),
                "title": item.title,
                "category": item.metadata.get("category", "other") if item.metadata else "other",
                "tags": item.metadata.get("tags", []) if item.metadata else [],
                "url": item.url
            })
        
        # Generate clusters
        clusters = await claude_ai.cluster_content_by_similarity(content_data)
        
        # Map indices back to actual content IDs
        mapped_clusters = {}
        for cluster_name, indices in clusters.items():
            mapped_clusters[cluster_name] = [
                {
                    "id": content_data[i]["id"],
                    "title": content_data[i]["title"],
                    "url": content_data[i]["url"]
                }
                for i in indices if i < len(content_data)
            ]
        
        return {
            "status": "success",
            "clusters": mapped_clusters,
            "total_items": len(content_items),
            "cluster_count": len(clusters)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clustering content: {e}")
        raise HTTPException(status_code=500, detail="Failed to cluster content")

@router.get("/ai-stats")
async def get_ai_statistics():
    """
    Get AI service statistics and health information
    """
    try:
        # This would be expanded with actual statistics
        stats = {
            "service_status": "operational" if claude_ai.client else "degraded",
            "features_available": [
                "content_analysis",
                "smart_tags",
                "recommendations",
                "content_enhancement",
                "batch_processing",
                "content_clustering",
                "advanced_insights"
            ],
            "rate_limits": {
                "requests_per_minute": claude_ai.rate_limit_requests_per_minute,
                "tokens_per_minute": claude_ai.rate_limit_tokens_per_minute
            },
            "model": claude_ai.model
        }
        
        return {
            "status": "success",
            "data": stats
        }
        
    except Exception as e:
        logger.error(f"Error getting AI statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get AI statistics")