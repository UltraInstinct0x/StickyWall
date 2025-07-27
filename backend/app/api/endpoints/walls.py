from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.models.models import User, Wall, ShareItem, OEmbedData

router = APIRouter()


# Pydantic response models
class ShareItemResponse(BaseModel):
    id: int
    title: Optional[str]
    text: Optional[str]
    url: Optional[str]
    content_type: Optional[str]
    file_path: Optional[str]
    metadata: dict
    created_at: str
    # oEmbed fields
    preview_url: Optional[str] = None
    oembed_type: Optional[str] = None
    author_name: Optional[str] = None
    provider_name: Optional[str] = None
    description: Optional[str] = None
    html: Optional[str] = None
    platform: Optional[str] = None
    thumbnail_width: Optional[int] = None
    thumbnail_height: Optional[int] = None

    class Config:
        from_attributes = True


class WallResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_default: bool
    created_at: str
    item_count: int

    class Config:
        from_attributes = True


class WallWithItemsResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_default: bool
    created_at: str
    items: List[ShareItemResponse]

    class Config:
        from_attributes = True


@router.get("/walls", response_model=List[WallResponse])
async def list_walls(
    session_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """List all walls for a user (anonymous or registered)."""
    if not session_id:
        # For MVP testing - return all walls
        logger.info(f"DEBUG: No session_id, fetching all walls")
        result = await db.execute(
            select(Wall)
            .options(selectinload(Wall.items))
            .order_by(Wall.is_default.desc(), Wall.created_at.desc())
        )
        walls = result.scalars().all()
        logger.info(f"DEBUG: Found {len(walls)} walls")
    else:
        # Find user by session_id
        result = await db.execute(select(User).where(User.session_id == session_id))
        user = result.scalar_one_or_none()

        if not user:
            return []

        # Get walls with item count
        result = await db.execute(
            select(Wall)
            .where(Wall.user_id == user.id)
            .options(selectinload(Wall.items))
            .order_by(Wall.is_default.desc(), Wall.created_at.desc())
        )
        walls = result.scalars().all()

    # Transform to response format
    wall_responses = []
    for wall in walls:
        wall_responses.append(WallResponse(
            id=wall.id,
            name=wall.name,
            description=wall.description,
            is_default=bool(wall.is_default),
            created_at=wall.created_at.isoformat(),
            item_count=len(wall.items)
        ))

    return wall_responses


@router.get("/walls/{wall_id}", response_model=WallWithItemsResponse)
async def get_wall(
    wall_id: int = Path(..., description="Wall ID"),
    session_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific wall with all its items."""
    # Find user by session_id
    if session_id:
        result = await db.execute(select(User).where(User.session_id == session_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    else:
        # For now, allow anonymous access to any wall (for testing)
        # In production, you'd want proper access control
        user = None

    # Get wall with items and their oEmbed data
    result = await db.execute(
        select(Wall)
        .where(Wall.id == wall_id)
        .options(selectinload(Wall.items).selectinload(ShareItem.oembed_data))
    )
    wall = result.scalar_one_or_none()

    if not wall:
        raise HTTPException(status_code=404, detail="Wall not found")

    # Check ownership (if user is specified)
    if user and wall.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Transform items to response format
    item_responses = []
    for item in wall.items:
        # Get oEmbed data if available
        oembed = item.oembed_data

        # Use local thumbnail path or fallback to original URL
        preview_url = None
        if oembed:
            if oembed.local_thumbnail_path:
                preview_url = f"/api/files/{oembed.local_thumbnail_path}"
            elif oembed.thumbnail_url:
                preview_url = oembed.thumbnail_url

        item_responses.append(ShareItemResponse(
            id=item.id,
            title=oembed.title if oembed and oembed.title else item.title,
            text=item.text,
            url=item.url,
            content_type=item.content_type,
            file_path=item.file_path,
            metadata=item.item_metadata or {},
            created_at=item.created_at.isoformat(),
            preview_url=preview_url,
            oembed_type=oembed.oembed_type if oembed else None,
            author_name=oembed.author_name if oembed else None,
            provider_name=oembed.provider_name if oembed else None,
            description=oembed.description if oembed else None,
            html=oembed.html if oembed else None,
            platform=oembed.platform if oembed else None,
            thumbnail_width=oembed.thumbnail_width if oembed else None,
            thumbnail_height=oembed.thumbnail_height if oembed else None
        ))

    return WallWithItemsResponse(
        id=wall.id,
        name=wall.name,
        description=wall.description,
        is_default=bool(wall.is_default),
        created_at=wall.created_at.isoformat(),
        items=sorted(item_responses, key=lambda x: x.created_at, reverse=True)
    )
