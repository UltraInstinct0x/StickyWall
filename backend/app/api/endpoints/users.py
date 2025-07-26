"""
User Management API endpoints
Registration, profile management, and user statistics
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import logging

from app.core.database import get_db
from app.models.models import User, Wall, ShareItem
from app.services.auth_service import auth_service, get_current_user
from app.core.security import get_password_hash

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/users", tags=["User Management"])

@router.post("/register", response_model=Dict[str, Any])
async def register_user(
    username: str,
    email: str,
    password: str,
    full_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Register a new user account
    """
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(
            (User.username == username) | (User.email == email)
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username or email already registered"
            )
        
        # Create new user
        password_hash = get_password_hash(password)
        
        new_user = User(
            username=username,
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            is_anonymous=False,
            is_active=True
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        # Create default wall
        default_wall = Wall(
            name="My Digital Wall",
            description="Your default content wall",
            user_id=new_user.id,
            is_default=1
        )
        
        db.add(default_wall)
        db.commit()
        
        return {
            "success": True,
            "message": "User registered successfully",
            "user": {
                "id": new_user.id,
                "username": new_user.username,
                "email": new_user.email,
                "full_name": new_user.full_name,
                "created_at": new_user.created_at.isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"User registration failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/profile", response_model=Dict[str, Any])
async def get_user_profile(current_user: User = Depends(get_current_user)):
    """
    Get current user's profile information
    """
    try:
        return {
            "success": True,
            "user": {
                "id": current_user.id,
                "username": current_user.username,
                "email": current_user.email,
                "full_name": current_user.full_name,
                "bio": current_user.bio,
                "avatar_url": current_user.avatar_url,
                "is_verified": current_user.is_verified,
                "settings": current_user.settings,
                "created_at": current_user.created_at.isoformat(),
                "last_login": current_user.last_login.isoformat() if current_user.last_login else None
            }
        }
    except Exception as e:
        logger.error(f"Failed to get user profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/profile", response_model=Dict[str, Any])
async def update_user_profile(
    full_name: Optional[str] = None,
    bio: Optional[str] = None,
    avatar_url: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update user profile information
    """
    try:
        if full_name is not None:
            current_user.full_name = full_name
        if bio is not None:
            current_user.bio = bio
        if avatar_url is not None:
            current_user.avatar_url = avatar_url
            
        db.commit()
        db.refresh(current_user)
        
        return {
            "success": True,
            "message": "Profile updated successfully",
            "user": {
                "id": current_user.id,
                "username": current_user.username,
                "full_name": current_user.full_name,
                "bio": current_user.bio,
                "avatar_url": current_user.avatar_url
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to update user profile: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics", response_model=Dict[str, Any])
async def get_user_statistics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user's content statistics
    """
    try:
        # Count walls and items
        wall_count = db.query(Wall).filter(Wall.user_id == current_user.id).count()
        item_count = db.query(ShareItem).join(Wall).filter(Wall.user_id == current_user.id).count()
        
        # Get recent activity
        recent_items = db.query(ShareItem).join(Wall).filter(
            Wall.user_id == current_user.id
        ).order_by(ShareItem.created_at.desc()).limit(5).all()
        
        return {
            "success": True,
            "statistics": {
                "wall_count": wall_count,
                "item_count": item_count,
                "recent_activity": [
                    {
                        "id": item.id,
                        "title": item.title,
                        "content_type": item.content_type,
                        "created_at": item.created_at.isoformat()
                    }
                    for item in recent_items
                ]
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get user statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/account", response_model=Dict[str, Any])
async def delete_user_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete user account and all associated data
    """
    try:
        # Delete user (cascades to walls and items)
        db.delete(current_user)
        db.commit()
        
        return {
            "success": True,
            "message": "Account deleted successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to delete user account: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))