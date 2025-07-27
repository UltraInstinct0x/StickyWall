import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import httpx
from celery import Celery
from sqlalchemy.orm import Session

from app.core.database import AsyncSessionLocal
from app.models.models import ShareItem, OEmbedData, OEmbedCache
from app.services.oembed_service import oembed_service, OEmbedResponse
from app.services.r2_storage import r2_storage

logger = logging.getLogger(__name__)

# Initialize Celery (this should match your main Celery configuration)
celery_app = Celery('digital_wall')

async def get_db():
    """Get database session for background tasks"""
    async with AsyncSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()

async def process_oembed_background(item_id: int, force_refresh: bool = False):
    """
    Background task to process oEmbed data for a share item.

    This function:
    1. Extracts oEmbed data from the URL
    2. Downloads and stores thumbnails locally
    3. Preserves content when possible
    4. Updates the database with extracted information
    """
    async with AsyncSessionLocal() as db:

        try:
            # Get the share item
            from sqlalchemy import select
            result = await db.execute(select(ShareItem).where(ShareItem.id == item_id))
            share_item = result.scalar_one_or_none()
            if not share_item:
                logger.error(f"Share item {item_id} not found")
                return False

            if not share_item.url:
                logger.error(f"Share item {item_id} has no URL")
                return False

            url = share_item.url
            logger.info(f"Processing oEmbed for item {item_id}: {url}")

            # Check if already processed (unless force refresh)
            result = await db.execute(select(OEmbedData).where(OEmbedData.share_item_id == item_id))
            existing_oembed = result.scalar_one_or_none()

            if existing_oembed and not force_refresh:
                logger.info(f"oEmbed data already exists for item {item_id}")
                return True

            # Extract oEmbed data
            oembed_data = await oembed_service.get_oembed_data(url)

            if not oembed_data:
                logger.warning(f"Failed to extract oEmbed data for {url}")
                # Mark as processed even if failed to avoid repeated attempts
                share_item.oembed_processed = True

                # Create a minimal oEmbed record to indicate processing was attempted
                if not existing_oembed:
                    oembed_record = OEmbedData(
                        share_item_id=item_id,
                        oembed_type="link",
                        extraction_status="failed",
                        extraction_error="No oEmbed data available"
                    )
                    db.add(oembed_record)

                await db.commit()
                return False

            # Download and store thumbnail if available
            local_thumbnail_path = None
            if oembed_data.thumbnail_url:
                try:
                    local_thumbnail_path = await download_and_store_thumbnail(
                        oembed_data.thumbnail_url,
                        item_id,
                        oembed_data.platform or "unknown"
                    )
                except Exception as e:
                    logger.error(f"Failed to download thumbnail for item {item_id}: {str(e)}")

            # Download and store content if possible (for certain types)
            local_content_path = None
            if oembed_data.type == "photo" and oembed_data.url:
                try:
                    local_content_path = await download_and_store_content(
                        str(oembed_data.url),
                        item_id,
                        oembed_data.platform or "unknown",
                        "image"
                    )
                except Exception as e:
                    logger.error(f"Failed to download content for item {item_id}: {str(e)}")

            # Create or update oEmbed record
            if existing_oembed:
                # Update existing record
                existing_oembed.oembed_type = oembed_data.type
                existing_oembed.title = oembed_data.title
                existing_oembed.author_name = oembed_data.author_name
                existing_oembed.author_url = str(oembed_data.author_url) if oembed_data.author_url else None
                existing_oembed.provider_name = oembed_data.provider_name
                existing_oembed.provider_url = str(oembed_data.provider_url) if oembed_data.provider_url else None
                existing_oembed.cache_age = min(oembed_data.cache_age, 2147483647) if oembed_data.cache_age else None
                existing_oembed.thumbnail_url = str(oembed_data.thumbnail_url) if oembed_data.thumbnail_url else None
                existing_oembed.thumbnail_width = oembed_data.thumbnail_width
                existing_oembed.thumbnail_height = oembed_data.thumbnail_height
                existing_oembed.content_url = str(oembed_data.url) if oembed_data.url else None
                existing_oembed.width = oembed_data.width
                existing_oembed.height = oembed_data.height
                existing_oembed.html = oembed_data.html
                existing_oembed.platform = oembed_data.platform
                existing_oembed.platform_id = oembed_data.platform_id
                existing_oembed.description = oembed_data.description
                existing_oembed.duration = oembed_data.duration
                existing_oembed.view_count = oembed_data.view_count
                existing_oembed.like_count = oembed_data.like_count
                existing_oembed.local_thumbnail_path = local_thumbnail_path
                existing_oembed.local_content_path = local_content_path
                existing_oembed.extraction_status = "success"
                existing_oembed.extraction_error = None
                existing_oembed.last_updated = datetime.utcnow()
                # Convert Pydantic model to dict with string conversion for URLs
                raw_data = oembed_data.dict()
                # Convert any HttpUrl objects to strings
                for key, value in raw_data.items():
                    if hasattr(value, '__str__') and 'HttpUrl' in str(type(value)):
                        raw_data[key] = str(value)
                existing_oembed.raw_oembed_data = raw_data
                existing_oembed.updated_at = datetime.utcnow()

                oembed_record = existing_oembed
            else:
                # Create new record
                oembed_record = OEmbedData(
                    share_item_id=item_id,
                    oembed_type=oembed_data.type,
                    title=oembed_data.title,
                    author_name=oembed_data.author_name,
                    author_url=str(oembed_data.author_url) if oembed_data.author_url else None,
                    provider_name=oembed_data.provider_name,
                    provider_url=str(oembed_data.provider_url) if oembed_data.provider_url else None,
                    cache_age=min(oembed_data.cache_age, 2147483647) if oembed_data.cache_age else None,
                    thumbnail_url=str(oembed_data.thumbnail_url) if oembed_data.thumbnail_url else None,
                    thumbnail_width=oembed_data.thumbnail_width,
                    thumbnail_height=oembed_data.thumbnail_height,
                    content_url=str(oembed_data.url) if oembed_data.url else None,
                    width=oembed_data.width,
                    height=oembed_data.height,
                    html=oembed_data.html,
                    platform=oembed_data.platform,
                    platform_id=oembed_data.platform_id,
                    description=oembed_data.description,
                    duration=oembed_data.duration,
                    view_count=oembed_data.view_count,
                    like_count=oembed_data.like_count,
                    local_thumbnail_path=local_thumbnail_path,
                    local_content_path=local_content_path,
                    extraction_status="success",
                    last_updated=datetime.utcnow(),
                    raw_oembed_data={}  # Will be set below with proper serialization
                )

                # Convert Pydantic model to dict with string conversion for URLs
                raw_data = oembed_data.dict()
                # Convert any HttpUrl objects to strings
                for key, value in raw_data.items():
                    if hasattr(value, '__str__') and 'HttpUrl' in str(type(value)):
                        raw_data[key] = str(value)
                oembed_record.raw_oembed_data = raw_data
                db.add(oembed_record)

            # Update share item
            share_item.has_oembed = True
            share_item.oembed_processed = True
            share_item.content_type = "oembed"
            share_item.updated_at = datetime.utcnow()

            # Update item metadata with oEmbed info
            if not share_item.item_metadata:
                share_item.item_metadata = {}

            share_item.item_metadata.update({
                "oembed_platform": oembed_data.platform,
                "oembed_type": oembed_data.type,
                "oembed_provider": oembed_data.provider_name,
                "has_thumbnail": local_thumbnail_path is not None,
                "has_local_content": local_content_path is not None
            })

            # Update title if not set
            if not share_item.title and oembed_data.title:
                share_item.title = oembed_data.title

            await db.commit()

            logger.info(f"Successfully processed oEmbed for item {item_id}")
            return True

        except Exception as e:
            logger.error(f"Error processing oEmbed for item {item_id}: {str(e)}")

            # Mark as failed to avoid repeated attempts
            try:
                share_item.oembed_processed = True

                # Create failed record if doesn't exist
                result = await db.execute(select(OEmbedData).where(OEmbedData.share_item_id == item_id))
                existing_oembed = result.scalar_one_or_none()

                if not existing_oembed:
                    oembed_record = OEmbedData(
                        share_item_id=item_id,
                        oembed_type="link",
                        extraction_status="failed",
                        extraction_error=str(e)
                    )
                    db.add(oembed_record)

                await db.commit()
            except Exception as commit_error:
                logger.error(f"Failed to save error state: {commit_error}")

            return False

async def download_and_store_thumbnail(
    thumbnail_url: str,
    item_id: int,
    platform: str
) -> Optional[str]:
    """
    Download and store thumbnail image locally.

    Returns the local file path if successful, None otherwise.
    """
    try:
        # Generate filename
        url_hash = hashlib.md5(thumbnail_url.encode()).hexdigest()[:16]
        file_extension = thumbnail_url.split('.')[-1].split('?')[0].lower()
        if file_extension not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
            file_extension = 'jpg'

        filename = f"thumbnail_{item_id}_{platform}_{url_hash}.{file_extension}"
        local_path = f"oembed/thumbnails/{filename}"

        # Download the image
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(thumbnail_url)
            response.raise_for_status()

            # Check content type
            content_type = response.headers.get('content-type', '')
            if not content_type.startswith('image/'):
                logger.warning(f"Thumbnail URL returned non-image content: {content_type}")
                return None

            # Check file size (limit to 10MB)
            content_length = response.headers.get('content-length')
            if content_length and int(content_length) > 10 * 1024 * 1024:
                logger.warning(f"Thumbnail too large: {content_length} bytes")
                return None

            image_data = response.content

            # Limit content size if not specified in headers
            if len(image_data) > 10 * 1024 * 1024:
                logger.warning(f"Downloaded thumbnail too large: {len(image_data)} bytes")
                return None

        # Store in R2/S3
        await r2_storage.upload_file(
            file_data=image_data,
            file_path=local_path,
            content_type=content_type
        )

        logger.info(f"Stored thumbnail for item {item_id}: {local_path}")
        return local_path

    except Exception as e:
        logger.error(f"Failed to download/store thumbnail {thumbnail_url}: {str(e)}")
        return None

async def download_and_store_content(
    content_url: str,
    item_id: int,
    platform: str,
    content_type: str = "unknown"
) -> Optional[str]:
    """
    Download and store content (images, videos, etc.) locally.

    Returns the local file path if successful, None otherwise.
    """
    try:
        # Generate filename
        url_hash = hashlib.md5(content_url.encode()).hexdigest()[:16]
        file_extension = content_url.split('.')[-1].split('?')[0].lower()

        # Validate file extension
        allowed_extensions = {
            'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
            'video': ['mp4', 'webm', 'mov', 'avi'],
            'audio': ['mp3', 'wav', 'ogg', 'm4a']
        }

        if content_type in allowed_extensions:
            if file_extension not in allowed_extensions[content_type]:
                file_extension = allowed_extensions[content_type][0]
        else:
            if file_extension not in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mp3']:
                file_extension = 'bin'

        filename = f"content_{item_id}_{platform}_{url_hash}.{file_extension}"
        local_path = f"oembed/content/{filename}"

        # Download with size limits
        max_size = 50 * 1024 * 1024  # 50MB limit

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream('GET', content_url) as response:
                response.raise_for_status()

                # Check content length
                content_length = response.headers.get('content-length')
                if content_length and int(content_length) > max_size:
                    logger.warning(f"Content too large: {content_length} bytes")
                    return None

                # Stream download with size limit
                content_data = b""
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    content_data += chunk
                    if len(content_data) > max_size:
                        logger.warning(f"Content exceeded size limit during download")
                        return None

                content_type_header = response.headers.get('content-type', '')

        # Store in R2/S3
        await r2_storage.upload_file(
            file_data=content_data,
            file_path=local_path,
            content_type=content_type_header
        )

        logger.info(f"Stored content for item {item_id}: {local_path}")
        return local_path

    except Exception as e:
        logger.error(f"Failed to download/store content {content_url}: {str(e)}")
        return None

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_oembed_task(self, item_id: int, force_refresh: bool = False):
    """
    Celery task wrapper for oEmbed processing.

    This allows the oEmbed processing to be queued and processed
    by Celery workers with retry logic.
    """
    try:
        # Run the async function in a new event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            result = loop.run_until_complete(
                process_oembed_background(item_id, force_refresh)
            )
            return result
        finally:
            loop.close()

    except Exception as e:
        logger.error(f"Celery oEmbed task failed for item {item_id}: {str(e)}")

        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            retry_delay = min(300, (2 ** self.request.retries) * 60)  # Max 5 minutes
            raise self.retry(countdown=retry_delay, exc=e)
        else:
            logger.error(f"Max retries exceeded for oEmbed processing of item {item_id}")
            return False

@celery_app.task
async def cleanup_expired_oembed_cache():
    """
    Periodic task to clean up expired oEmbed cache entries.

    Should be run daily via Celery beat.
    """
    async with AsyncSessionLocal() as db:
        try:
            from sqlalchemy import select, delete
            # Count expired cache entries
            result = await db.execute(select(OEmbedCache).where(
                OEmbedCache.expires_at < datetime.utcnow()
            ))
            expired_count = len(result.scalars().all())

            # Delete expired cache entries
            await db.execute(delete(OEmbedCache).where(
                OEmbedCache.expires_at < datetime.utcnow()
            ))

            await db.commit()

            logger.info(f"Cleaned up {expired_count} expired oEmbed cache entries")
            return expired_count

        except Exception as e:
            logger.error(f"Failed to cleanup oEmbed cache: {str(e)}")
            return 0

@celery_app.task
def refresh_oembed_data_batch(item_ids: list[int]):
    """
    Batch refresh oEmbed data for multiple items.

    Useful for periodic updates or bulk operations.
    """
    results = []

    for item_id in item_ids:
        try:
            # Process each item
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            try:
                result = loop.run_until_complete(
                    process_oembed_background(item_id, force_refresh=True)
                )
                results.append({"item_id": item_id, "success": result})
            finally:
                loop.close()

        except Exception as e:
            logger.error(f"Failed to refresh oEmbed for item {item_id}: {str(e)}")
            results.append({"item_id": item_id, "success": False, "error": str(e)})

    successful = sum(1 for r in results if r.get("success"))
    total = len(results)

    logger.info(f"Batch oEmbed refresh completed: {successful}/{total} successful")
    return {
        "total": total,
        "successful": successful,
        "failed": total - successful,
        "results": results
    }

# Celery beat schedule for periodic tasks
celery_beat_schedule = {
    'cleanup-oembed-cache': {
        'task': 'app.tasks.oembed_tasks.cleanup_expired_oembed_cache',
        'schedule': 24 * 60 * 60,  # Run daily
    },
}
