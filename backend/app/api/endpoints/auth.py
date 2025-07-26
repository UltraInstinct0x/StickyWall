"""
Authentication API endpoints
User registration, login, logout, and profile management
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Form, Request, Response, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import logging
from datetime import datetime, timedelta
import secrets

from app.services.auth_service import auth_service
from app.services.redis_service import redis_service
from app.models.models import User
from app.core.database import get_db
from sqlalchemy.orm import Session
from sqlalchemy import or_

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Security
security = HTTPBearer(auto_error=False)

# Pydantic models
class UserRegistration(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str  # Can be username or email
    password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class PasswordReset(BaseModel):
    email: EmailStr

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: Optional[str]
    email: Optional[str]
    full_name: Optional[str]
    bio: Optional[str]
    avatar_url: Optional[str]
    is_verified: bool
    is_anonymous: bool
    created_at: datetime
    last_login: Optional[datetime]

# Dependency: Get current user from token
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user from JWT token"""
    
    if not credentials:
        return None
    
    token_data = await auth_service.decode_token(credentials.credentials)
    if not token_data:
        return None
    
    user_id = token_data.get("user_id")
    if not user_id:
        return None
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        return None
    
    return user

# Dependency: Require authenticated user
async def require_auth(user: User = Depends(get_current_user)) -> User:
    """Require authenticated user"""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user

@router.post("/register", response_model=Dict[str, Any])
async def register_user(
    user_data: UserRegistration,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Register a new user
    """
    try:
        # Validate password strength
        password_validation = auth_service.validate_password_strength(user_data.password)
        if not password_validation['valid']:
            raise HTTPException(
                status_code=400, 
                detail={
                    "message": "Password is too weak",
                    "validation": password_validation
                }
            )
        
        # Check if user already exists
        existing_user = db.query(User).filter(
            or_(User.username == user_data.username, User.email == user_data.email)
        ).first()
        
        if existing_user:
            field = "username" if existing_user.username == user_data.username else "email"
            raise HTTPException(status_code=400, detail=f"User with this {field} already exists")
        
        # Hash password
        password_hash = auth_service.hash_password(user_data.password)
        
        # Create user
        new_user = User(
            username=user_data.username,
            email=user_data.email,
            password_hash=password_hash,
            full_name=user_data.full_name,
            is_anonymous=False,
            is_active=True,
            is_verified=False,  # Would be False until email verification
            last_login=datetime.utcnow()
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        # Create tokens
        token_data = {
            "user_id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "is_anonymous": False
        }
        
        access_token = auth_service.create_access_token(token_data)
        refresh_token = auth_service.create_refresh_token(token_data)
        
        # Create session
        session_id = await auth_service.create_session({
            "user_id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "ip_address": request.client.host,
            "user_agent": request.headers.get("user-agent", "")
        })
        
        # Set secure HTTP-only cookies
        response.set_cookie(
            key="session_id",
            value=session_id,
            max_age=86400 * 30,  # 30 days
            httponly=True,
            secure=True,
            samesite="lax"
        )
        
        logger.info(f"User registered: {new_user.username} ({new_user.email})")
        
        return {
            "success": True,
            "message": "User registered successfully",
            "user": UserResponse.from_orm(new_user),
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": auth_service.access_token_expire_minutes * 60
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Registration failed")

@router.post("/login", response_model=Dict[str, Any])
async def login_user(
    user_data: UserLogin,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Login user with username/email and password
    """
    try:
        # Find user by username or email
        user = db.query(User).filter(
            or_(User.username == user_data.username, User.email == user_data.username)
        ).first()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not user.password_hash:
            raise HTTPException(status_code=401, detail="User has no password set")
        
        # Verify password
        if not auth_service.verify_password(user_data.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        if not user.is_active:
            raise HTTPException(status_code=401, detail="Account is deactivated")
        
        # Update last login
        user.last_login = datetime.utcnow()
        db.commit()
        
        # Create tokens
        token_data = {
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "is_anonymous": False
        }
        
        access_token = auth_service.create_access_token(token_data)
        refresh_token = auth_service.create_refresh_token(token_data)
        
        # Create session
        session_id = await auth_service.create_session({
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "ip_address": request.client.host,
            "user_agent": request.headers.get("user-agent", "")
        })
        
        # Set secure cookies
        response.set_cookie(
            key="session_id",
            value=session_id,
            max_age=86400 * 30,
            httponly=True,
            secure=True,
            samesite="lax"
        )
        
        logger.info(f"User logged in: {user.username}")
        
        return {
            "success": True,
            "message": "Login successful",
            "user": UserResponse.from_orm(user),
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": auth_service.access_token_expire_minutes * 60
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

@router.post("/logout")
async def logout_user(
    response: Response,
    session_id: Optional[str] = Cookie(None),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user: User = Depends(get_current_user)
):
    """
    Logout user and invalidate tokens
    """
    try:
        success_messages = []
        
        # Blacklist access token
        if credentials:
            await auth_service.blacklist_token(credentials.credentials)
            success_messages.append("Access token blacklisted")
        
        # Delete session
        if session_id:
            await auth_service.delete_session(session_id)
            response.delete_cookie(key="session_id")
            success_messages.append("Session deleted")
        
        if user:
            logger.info(f"User logged out: {user.username}")
        
        return {
            "success": True,
            "message": "Logout successful",
            "details": success_messages
        }
        
    except Exception as e:
        logger.error(f"Logout failed: {e}")
        raise HTTPException(status_code=500, detail="Logout failed")

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(user: User = Depends(require_auth)):
    """
    Get current user information
    """
    return UserResponse.from_orm(user)

@router.put("/me", response_model=UserResponse)
async def update_profile(
    profile_data: ProfileUpdate,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Update user profile
    """
    try:
        # Update user fields
        if profile_data.full_name is not None:
            user.full_name = profile_data.full_name
        
        if profile_data.bio is not None:
            user.bio = profile_data.bio
        
        if profile_data.avatar_url is not None:
            user.avatar_url = profile_data.avatar_url
        
        user.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(user)
        
        logger.info(f"Profile updated for user: {user.username}")
        
        return UserResponse.from_orm(user)
        
    except Exception as e:
        logger.error(f"Profile update failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Profile update failed")

@router.post("/change-password")
async def change_password(
    password_data: PasswordChange,
    user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """
    Change user password
    """
    try:
        # Verify current password
        if not auth_service.verify_password(password_data.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        # Validate new password strength
        validation = auth_service.validate_password_strength(password_data.new_password)
        if not validation['valid']:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "New password is too weak",
                    "validation": validation
                }
            )
        
        # Hash and update password
        user.password_hash = auth_service.hash_password(password_data.new_password)
        user.updated_at = datetime.utcnow()
        
        db.commit()
        
        logger.info(f"Password changed for user: {user.username}")
        
        return {
            "success": True,
            "message": "Password changed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password change failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Password change failed")

@router.post("/refresh-token")
async def refresh_access_token(refresh_token: str = Form(...)):
    """
    Refresh access token using refresh token
    """
    try:
        # Decode and validate refresh token
        token_data = await auth_service.decode_token(refresh_token)
        
        if not token_data or token_data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        
        # Create new access token
        new_token_data = {
            "user_id": token_data["user_id"],
            "username": token_data["username"],
            "email": token_data["email"],
            "is_anonymous": token_data.get("is_anonymous", False)
        }
        
        new_access_token = auth_service.create_access_token(new_token_data)
        
        return {
            "success": True,
            "access_token": new_access_token,
            "token_type": "bearer",
            "expires_in": auth_service.access_token_expire_minutes * 60
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh failed: {e}")
        raise HTTPException(status_code=500, detail="Token refresh failed")

@router.get("/session")
async def get_session_info(session_id: Optional[str] = Cookie(None)):
    """
    Get session information
    """
    if not session_id:
        return {
            "success": False,
            "message": "No session found"
        }
    
    session_data = await auth_service.get_session(session_id)
    
    if not session_data:
        return {
            "success": False,
            "message": "Session not found or expired"
        }
    
    return {
        "success": True,
        "session": {
            "user_id": session_data.get("user_id"),
            "username": session_data.get("username"),
            "created_at": session_data.get("created_at"),
            "last_accessed": session_data.get("last_accessed")
        }
    }

@router.post("/validate-password")
async def validate_password(password: str = Form(...)):
    """
    Validate password strength
    """
    validation = auth_service.validate_password_strength(password)
    
    return {
        "success": True,
        "validation": validation
    }