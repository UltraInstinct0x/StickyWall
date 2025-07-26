import uuid
import os
from typing import Optional, List
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.models import User, Wall, ShareItem
from app.services.content_processor import ContentProcessor
from app.services.r2_storage import R2StorageService

router = APIRouter()


async def get_or_create_anonymous_user(session: AsyncSession, session_id: Optional[str] = None) -> User:
    """Get or create an anonymous user."""
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Try to find existing user
    result = await session.execute(select(User).where(User.session_id == session_id))
    user = result.scalar_one_or_none()
    
    if not user:
        # Create new anonymous user
        user = User(session_id=session_id)
        session.add(user)
        await session.commit()
        await session.refresh(user)
    
    return user


async def get_or_create_default_wall(session: AsyncSession, user: User) -> Wall:
    """Get or create a default wall for the user."""
    # Try to find existing default wall
    result = await session.execute(
        select(Wall).where(Wall.user_id == user.id, Wall.is_default == 1)
    )
    wall = result.scalar_one_or_none()
    
    if not wall:
        # Create new default wall
        wall = Wall(
            name="My Digital Wall",
            user_id=user.id,
            is_default=1,
            description="Your shared content collection"
        )
        session.add(wall)
        await session.commit()
        await session.refresh(wall)
    
    return wall


@router.post("/share")
async def handle_share(
    request: Request,
    title: Optional[str] = Form(None),
    text: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    session_id: Optional[str] = Form(None),
    source: Optional[str] = Form("pwa"),
    db: AsyncSession = Depends(get_db)
):
    """
    Handle share requests from both PWA and native mobile apps.
    
    This endpoint processes shared content and stores it in the user's default wall.
    Supports file uploads to cloud storage.
    """
    try:
        # Get or create anonymous user
        user = await get_or_create_anonymous_user(db, session_id)
        
        # Get or create default wall
        wall = await get_or_create_default_wall(db, user)
        
        # Process the shared content
        processor = ContentProcessor()
        content_type = processor.detect_content_type(title, text, url, files)
        
        # Initialize storage service for file uploads
        storage_service = R2StorageService()
        uploaded_files = []
        
        # Handle file uploads if present
        if files and len(files) > 0:
            for file in files:
                if file.filename and file.size > 0:
                    try:
                        # Generate unique filename
                        file_extension = os.path.splitext(file.filename)[1]
                        unique_filename = f"{uuid.uuid4()}{file_extension}"
                        
                        # Upload to cloud storage
                        file_content = await file.read()
                        file_url = await storage_service.upload_file(
                            file_content,
                            unique_filename,
                            file.content_type or "application/octet-stream"
                        )
                        
                        uploaded_files.append({
                            "original_filename": file.filename,
                            "stored_filename": unique_filename,
                            "file_url": file_url,
                            "content_type": file.content_type,
                            "size": len(file_content)
                        })
                        
                    except Exception as upload_error:
                        print(f"Failed to upload file {file.filename}: {upload_error}")
                        # Continue processing other files
                        continue
        
        # Create share item
        share_item = ShareItem(
            wall_id=wall.id,
            title=title or "Shared Content",
            text=text,
            url=url,
            content_type=content_type,
            metadata={
                "original_title": title,
                "source": source,
                "user_agent": request.headers.get("user-agent", "Unknown"),
                "content_length": len(text) if text else 0,
                "has_files": len(uploaded_files) > 0,
                "uploaded_files": uploaded_files,
                "session_id": session_id
            }
        )
        
        db.add(share_item)
        await db.commit()
        await db.refresh(share_item)
        
        # Return appropriate response based on source
        if source == "ios_share_extension" or source == "android_share" or request.headers.get("accept") == "application/json":
            # Return JSON response for native mobile apps
            return JSONResponse(
                content={
                    "success": True,
                    "share_id": share_item.id,
                    "wall_id": wall.id,
                    "message": "Content added to your Digital Wall successfully",
                    "uploaded_files": len(uploaded_files)
                },
                status_code=200
            )
        else:
            # Return redirect for PWA
            return RedirectResponse(url=f"/?share=success&wall_id={wall.id}", status_code=303)
        
    except Exception as e:
        error_message = f"Failed to process share: {str(e)}"
        print(f"Share processing error: {error_message}")
        
        # Return appropriate error response based on source
        if source == "ios_share_extension" or source == "android_share" or request.headers.get("accept") == "application/json":
            return JSONResponse(
                content={
                    "success": False,
                    "error": error_message
                },
                status_code=500
            )
        else:
            raise HTTPException(status_code=500, detail=error_message)


@router.get("/sync/{session_id}")
async def sync_user_data(
    session_id: str,
    last_sync: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Sync user data between different clients (PWA, iOS, Android).
    Returns wall data and recent share items.
    """
    try:
        # Get user by session ID
        user = await get_or_create_anonymous_user(db, session_id)
        
        # Get user's walls
        walls_result = await db.execute(
            select(Wall).where(Wall.user_id == user.id)
        )
        walls = walls_result.scalars().all()
        
        # Get recent share items
        shares_query = select(ShareItem).join(Wall).where(Wall.user_id == user.id)
        
        if last_sync:
            # Filter by last sync time if provided
            try:
                from datetime import datetime
                last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
                shares_query = shares_query.where(ShareItem.created_at > last_sync_dt)
            except ValueError:
                pass  # Invalid date format, ignore filter
        
        shares_query = shares_query.order_by(ShareItem.created_at.desc()).limit(50)
        shares_result = await db.execute(shares_query)
        shares = shares_result.scalars().all()
        
        return {
            "success": True,
            "user_id": user.id,
            "session_id": session_id,
            "walls": [
                {
                    "id": wall.id,
                    "name": wall.name,
                    "description": wall.description,
                    "is_default": bool(wall.is_default),
                    "created_at": wall.created_at.isoformat(),
                    "updated_at": wall.updated_at.isoformat()
                }
                for wall in walls
            ],
            "recent_shares": [
                {
                    "id": share.id,
                    "wall_id": share.wall_id,
                    "title": share.title,
                    "text": share.text,
                    "url": share.url,
                    "content_type": share.content_type,
                    "metadata": share.metadata,
                    "created_at": share.created_at.isoformat(),
                    "updated_at": share.updated_at.isoformat()
                }
                for share in shares
            ],
            "sync_timestamp": user.updated_at.isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.get("/session/{session_id}/walls")
async def get_user_walls(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get all walls for a user session.
    """
    try:
        user = await get_or_create_anonymous_user(db, session_id)
        
        walls_result = await db.execute(
            select(Wall).where(Wall.user_id == user.id).order_by(Wall.created_at.desc())
        )
        walls = walls_result.scalars().all()
        
        # Get share count for each wall
        wall_data = []
        for wall in walls:
            shares_count_result = await db.execute(
                select(ShareItem).where(ShareItem.wall_id == wall.id)
            )
            shares_count = len(shares_count_result.scalars().all())
            
            wall_data.append({
                "id": wall.id,
                "name": wall.name,
                "description": wall.description,
                "is_default": bool(wall.is_default),
                "shares_count": shares_count,
                "created_at": wall.created_at.isoformat(),
                "updated_at": wall.updated_at.isoformat()
            })
        
        return {
            "success": True,
            "walls": wall_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get walls: {str(e)}")