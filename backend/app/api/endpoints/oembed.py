from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from pydantic import BaseModel, HttpUrl
import hashlib
import logging

from app.core.database import get_db
from app.services.auth_service import get_current_user
from app.models.models import User, ShareItem, OEmbedData, OEmbedCache
from app.services.oembed_service import oembed_service, OEmbedResponse
from app.tasks.oembed_tasks import process_oembed_background

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models for API requests/responses

class OEmbedRequest(BaseModel):
    url: HttpUrl
    max_width: Optional[int] = None
    max_height: Optional[int] = None
    format: str = "json"

class BatchOEmbedRequest(BaseModel):
    urls: List[HttpUrl]
    max_width: Optional[int] = None
    max_height: Optional[int] = None

class OEmbedDataResponse(BaseModel):
    id: int
    share_item_id: int
    oembed_type: str
    title: Optional[str] = None
    author_name: Optional[str] = None
    author_url: Optional[str] = None
    provider_name: Optional[str] = None
    provider_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    thumbnail_width: Optional[int] = None
    thumbnail_height: Optional[int] = None
    content_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    html: Optional[str] = None
    platform: Optional[str] = None
    platform_id: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    comment_count: Optional[int] = None
    share_count: Optional[int] = None
    published_at: Optional[datetime] = None
    local_thumbnail_path: Optional[str] = None
    local_content_path: Optional[str] = None
    extraction_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class OEmbedPreviewResponse(BaseModel):
    url: str
    is_supported: bool
    provider: Optional[str] = None
    oembed_data: Optional[OEmbedResponse] = None
    cached: bool = False
    error: Optional[str] = None

class BatchOEmbedResponse(BaseModel):
    results: Dict[str, OEmbedPreviewResponse]
    total_processed: int
    successful: int
    failed: int
    cached: int

@router.post("/preview", response_model=OEmbedPreviewResponse)
async def preview_oembed(
    request: OEmbedRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Preview oEmbed data for a URL without storing it.

    This endpoint is useful for:
    - Previewing content before adding to wall
    - Validating URLs during sharing
    - Getting rich previews in UI
    """
    try:
        url_str = str(request.url)

        # Check if we have cached data
        url_hash = hashlib.sha256(url_str.encode()).hexdigest()
        result = await db.execute(select(OEmbedCache).where(
            OEmbedCache.url_hash == url_hash,
            OEmbedCache.expires_at > datetime.utcnow()
        ))
        cached_data = result.scalar_one_or_none()

        if cached_data:
            # Update cache statistics
            cached_data.hit_count += 1
            cached_data.last_hit = datetime.utcnow()
            await db.commit()

            return OEmbedPreviewResponse(
                url=url_str,
                is_supported=True,
                provider=cached_data.platform,
                oembed_data=OEmbedResponse(**cached_data.oembed_response),
                cached=True
            )

        # Check if URL is supported
        is_supported = oembed_service.is_supported_url(url_str)

        if not is_supported:
            return OEmbedPreviewResponse(
                url=url_str,
                is_supported=False,
                error="URL not supported by any oEmbed provider"
            )

        # Get oEmbed data
        oembed_data = await oembed_service.get_oembed_data(
            url_str,
            request.max_width,
            request.max_height
        )

        if not oembed_data:
            return OEmbedPreviewResponse(
                url=url_str,
                is_supported=True,
                error="Failed to extract oEmbed data"
            )

        # Cache the successful response
        oembed_dict = oembed_data.dict()
        # Convert HttpUrl objects to strings for JSON serialization
        for key, value in oembed_dict.items():
            if hasattr(value, '__str__') and 'HttpUrl' in str(type(value)):
                oembed_dict[key] = str(value)

        cache_entry = OEmbedCache(
            url_hash=url_hash,
            original_url=url_str,
            oembed_response=oembed_dict,
            status_code=200,
            platform=oembed_data.platform,
            expires_at=datetime.utcnow().replace(hour=23, minute=59, second=59)  # Cache until end of day
        )
        db.add(cache_entry)
        await db.commit()

        return OEmbedPreviewResponse(
            url=url_str,
            is_supported=True,
            provider=oembed_data.provider_name,
            oembed_data=oembed_data,
            cached=False
        )

    except Exception as e:
        logger.error(f"Error previewing oEmbed for {request.url}: {str(e)}")
        return OEmbedPreviewResponse(
            url=str(request.url),
            is_supported=False,
            error=f"Internal error: {str(e)}"
        )

@router.post("/batch-preview", response_model=BatchOEmbedResponse)
async def batch_preview_oembed(
    request: BatchOEmbedRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Get oEmbed previews for multiple URLs at once.

    Efficiently processes multiple URLs in parallel and returns
    comprehensive results including cache statistics.
    """
    try:
        urls = [str(url) for url in request.urls]
        results = {}

        # Check cache for all URLs first
        url_hashes = {url: hashlib.sha256(url.encode()).hexdigest() for url in urls}
        result = await db.execute(select(OEmbedCache).where(
            OEmbedCache.url_hash.in_(list(url_hashes.values())),
            OEmbedCache.expires_at > datetime.utcnow()
        ))
        cached_entries = result.scalars().all()

        cached_by_hash = {entry.url_hash: entry for entry in cached_entries}
        urls_to_process = []

        # Process cached results
        for url in urls:
            url_hash = url_hashes[url]
            if url_hash in cached_by_hash:
                cached_entry = cached_by_hash[url_hash]
                cached_entry.hit_count += 1
                cached_entry.last_hit = datetime.utcnow()

                results[url] = OEmbedPreviewResponse(
                    url=url,
                    is_supported=True,
                    provider=cached_entry.platform,
                    oembed_data=OEmbedResponse(**cached_entry.oembed_response),
                    cached=True
                )
            else:
                urls_to_process.append(url)

        # Process non-cached URLs
        if urls_to_process:
            oembed_results = await oembed_service.batch_get_oembed_data(
                urls_to_process,
                request.max_width,
                request.max_height
            )

            for url, oembed_data in oembed_results.items():
                if oembed_data:
                    # Cache successful results
                    url_hash = url_hashes[url]
                    oembed_dict = oembed_data.dict()
                    # Convert HttpUrl objects to strings for JSON serialization
                    for key, value in oembed_dict.items():
                        if hasattr(value, '__str__') and 'HttpUrl' in str(type(value)):
                            oembed_dict[key] = str(value)

                    cache_entry = OEmbedCache(
                        url_hash=url_hash,
                        original_url=url,
                        oembed_response=oembed_dict,
                        status_code=200,
                        platform=oembed_data.platform,
                        expires_at=datetime.utcnow().replace(hour=23, minute=59, second=59)
                    )
                    db.add(cache_entry)

                    results[url] = OEmbedPreviewResponse(
                        url=url,
                        is_supported=True,
                        provider=oembed_data.provider_name,
                        oembed_data=oembed_data,
                        cached=False
                    )
                else:
                    is_supported = oembed_service.is_supported_url(url)
                    results[url] = OEmbedPreviewResponse(
                        url=url,
                        is_supported=is_supported,
                        error="Failed to extract oEmbed data" if is_supported else "URL not supported"
                    )

        await db.commit()

        # Calculate statistics
        total_processed = len(results)
        successful = sum(1 for r in results.values() if r.oembed_data is not None)
        failed = total_processed - successful
        cached = sum(1 for r in results.values() if r.cached)

        return BatchOEmbedResponse(
            results=results,
            total_processed=total_processed,
            successful=successful,
            failed=failed,
            cached=cached
        )

    except Exception as e:
        logger.error(f"Error in batch oEmbed preview: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Batch preview failed: {str(e)}")

@router.get("/share-item/{item_id}/oembed", response_model=Optional[OEmbedDataResponse])
async def get_share_item_oembed(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get oEmbed data for a specific share item.

    Returns the stored oEmbed data if available, or None if not processed yet.
    """
    try:
        # Verify the share item exists and belongs to user
        result = await db.execute(select(ShareItem).where(ShareItem.id == item_id))
        share_item = result.scalar_one_or_none()
        if not share_item:
            raise HTTPException(status_code=404, detail="Share item not found")

        # Check if user has access to this item
        if share_item.wall.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Get oEmbed data
        result = await db.execute(select(OEmbedData).where(
            OEmbedData.share_item_id == item_id
        ))
        oembed_data = result.scalar_one_or_none()

        if not oembed_data:
            return None

        return OEmbedDataResponse.from_orm(oembed_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting oEmbed data for item {item_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get oEmbed data")

@router.post("/share-item/{item_id}/process", response_model=Dict[str, Any])
async def process_share_item_oembed(
    item_id: int,
    background_tasks: BackgroundTasks,
    force_refresh: bool = Query(False, description="Force refresh even if already processed"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Process oEmbed data for a share item.

    This endpoint triggers background processing of oEmbed data extraction
    and local content preservation for a share item.
    """
    try:
        # Verify the share item exists and belongs to user
        result = await db.execute(select(ShareItem).where(ShareItem.id == item_id))
        share_item = result.scalar_one_or_none()
        if not share_item:
            raise HTTPException(status_code=404, detail="Share item not found")

        # Check if user has access to this item
        if share_item.wall.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Check if item has a URL
        if not share_item.url:
            raise HTTPException(status_code=400, detail="Share item has no URL to process")

        # Check if already processed (unless force refresh)
        if share_item.oembed_processed and not force_refresh:
            return {
                "message": "oEmbed data already processed",
                "item_id": item_id,
                "status": "already_processed",
                "force_refresh": force_refresh
            }

        # Queue background processing
        background_tasks.add_task(
            process_oembed_background,
            item_id,
            force_refresh
        )

        # Update processing status
        share_item.oembed_processed = False  # Will be set to True when processing completes
        await db.commit()

        return {
            "message": "oEmbed processing queued",
            "item_id": item_id,
            "status": "queued",
            "url": share_item.url
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing oEmbed for item {item_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to queue oEmbed processing")

@router.get("/providers", response_model=List[Dict[str, Any]])
async def get_supported_providers():
    """
    Get list of supported oEmbed providers.

    Returns information about all supported platforms and their capabilities.
    """
    try:
        providers_info = []

        for name, provider in oembed_service.providers.items():
            providers_info.append({
                "name": name,
                "display_name": provider.name,
                "url": provider.url,
                "endpoint": provider.endpoint,
                "schemes": provider.schemes,
                "requires_auth": provider.requires_auth,
                "supports_discovery": provider.supports_discovery
            })

        return providers_info

    except Exception as e:
        logger.error(f"Error getting providers: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get providers")

@router.get("/check-url", response_model=Dict[str, Any])
async def check_url_support(
    url: str = Query(..., description="URL to check for oEmbed support")
):
    """
    Check if a URL is supported by any oEmbed provider.

    Quick endpoint to validate URLs before processing.
    """
    try:
        is_supported = oembed_service.is_supported_url(url)
        provider = oembed_service._identify_provider(url)

        return {
            "url": url,
            "is_supported": is_supported,
            "provider": provider.name if provider else None,
            "provider_key": provider.name.lower().replace(" ", "_") if provider else None
        }

    except Exception as e:
        logger.error(f"Error checking URL support: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check URL support")

@router.delete("/cache/clear")
async def clear_oembed_cache(
    platform: Optional[str] = Query(None, description="Clear cache for specific platform only"),
    older_than_days: Optional[int] = Query(None, description="Clear cache older than N days"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Clear oEmbed cache entries.

    Admin endpoint for cache management.
    """
    try:
        # For now, allow any authenticated user to clear cache
        # In production, you might want to restrict this to admin users

        # Build the where conditions
        conditions = []
        if platform:
            conditions.append(OEmbedCache.platform == platform)
        if older_than_days:
            cutoff_date = datetime.utcnow() - timedelta(days=older_than_days)
            conditions.append(OEmbedCache.created_at < cutoff_date)

        # Count entries to be deleted
        count_query = select(func.count(OEmbedCache.id))
        if conditions:
            count_query = count_query.where(*conditions)
        result = await db.execute(count_query)
        deleted_count = result.scalar()

        # Delete entries
        delete_query = delete(OEmbedCache)
        if conditions:
            delete_query = delete_query.where(*conditions)
        await db.execute(delete_query)
        await db.commit()

        return {
            "message": "Cache cleared successfully",
            "deleted_entries": deleted_count,
            "platform": platform,
            "older_than_days": older_than_days
        }

    except Exception as e:
        logger.error(f"Error clearing oEmbed cache: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")

@router.get("/cache/stats", response_model=Dict[str, Any])
async def get_cache_stats(
    db: AsyncSession = Depends(get_db)
):
    """
    Get oEmbed cache statistics.

    Returns cache usage statistics and performance metrics.
    """
    try:
        # Basic cache stats
        result = await db.execute(select(func.count(OEmbedCache.id)))
        total_entries = result.scalar()

        result = await db.execute(select(func.count(OEmbedCache.id)).where(
            OEmbedCache.expires_at < datetime.utcnow()
        ))
        expired_entries = result.scalar()

        # Platform breakdown
        result = await db.execute(select(
            OEmbedCache.platform,
            func.count(OEmbedCache.id).label('count'),
            func.sum(OEmbedCache.hit_count).label('total_hits')
        ).group_by(OEmbedCache.platform))
        platform_stats = result.all()

        # Most hit URLs
        result = await db.execute(select(
            OEmbedCache.original_url,
            OEmbedCache.hit_count,
            OEmbedCache.platform
        ).order_by(OEmbedCache.hit_count.desc()).limit(10))
        top_urls = result.all()

        return {
            "total_entries": total_entries,
            "active_entries": total_entries - expired_entries,
            "expired_entries": expired_entries,
            "platform_breakdown": [
                {
                    "platform": stat.platform,
                    "entries": stat.count,
                    "total_hits": stat.total_hits or 0
                }
                for stat in platform_stats
            ],
            "top_cached_urls": [
                {
                    "url": url.original_url,
                    "hits": url.hit_count,
                    "platform": url.platform
                }
                for url in top_urls
            ]
        }

    except Exception as e:
        logger.error(f"Error getting cache stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cache stats")
