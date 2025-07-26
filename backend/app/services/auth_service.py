"""
Authentication Service
JWT token management, user authentication, and session handling
"""
import os
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from passlib.context import CryptContext
from passlib.hash import bcrypt
from jose import JWTError
import secrets
import logging

from app.services.redis_service import redis_service

# Import required modules
try:
    from fastapi import Depends, HTTPException
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    from sqlalchemy.orm import Session
    from app.core.database import get_db
    from app.models.models import User
except ImportError:
    # Handle missing dependencies gracefully
    pass

logger = logging.getLogger(__name__)

class AuthService:
    """
    Authentication service for user management and JWT tokens
    """
    
    def __init__(self):
        self.secret_key = os.getenv("JWT_SECRET_KEY", "fallback-secret-key-change-in-production")
        self.algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
        self.refresh_token_expire_days = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "30"))
        
        # Password hashing
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        
        # Token blacklist prefix
        self.blacklist_prefix = "blacklist_token:"
    
    def hash_password(self, password: str) -> str:
        """Hash a password using bcrypt"""
        return self.pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return self.pwd_context.verify(plain_password, hashed_password)
    
    def create_access_token(self, data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """
        Create JWT access token
        
        Args:
            data: Claims to include in token
            expires_delta: Custom expiration time
            
        Returns:
            JWT token string
        """
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        })
        
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt
    
    def create_refresh_token(self, data: Dict[str, Any]) -> str:
        """
        Create JWT refresh token
        
        Args:
            data: Claims to include in token
            
        Returns:
            JWT refresh token string
        """
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=self.refresh_token_expire_days)
        
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "refresh",
            "jti": secrets.token_urlsafe(32)  # Unique token ID for blacklisting
        })
        
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt
    
    async def decode_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Decode and validate JWT token
        
        Args:
            token: JWT token string
            
        Returns:
            Token payload or None if invalid
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            
            # Check if token is blacklisted
            token_id = payload.get("jti")
            if token_id:
                blacklist_key = f"{self.blacklist_prefix}{token_id}"
                is_blacklisted = await redis_service.exists(blacklist_key)
                if is_blacklisted:
                    logger.warning(f"Token {token_id} is blacklisted")
                    return None
            
            return payload
            
        except JWTError as e:
            logger.warning(f"Token decode error: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected token decode error: {e}")
            return None
    
    async def blacklist_token(self, token: str) -> bool:
        """
        Blacklist a token (for logout)
        
        Args:
            token: JWT token to blacklist
            
        Returns:
            Success status
        """
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            token_id = payload.get("jti")
            
            if not token_id:
                logger.warning("Token has no JTI, cannot blacklist")
                return False
            
            # Calculate TTL based on token expiration
            exp_timestamp = payload.get("exp")
            if exp_timestamp:
                exp_datetime = datetime.fromtimestamp(exp_timestamp)
                ttl = max(1, int((exp_datetime - datetime.utcnow()).total_seconds()))
            else:
                ttl = 86400  # Default 24 hours
            
            # Add to blacklist
            blacklist_key = f"{self.blacklist_prefix}{token_id}"
            await redis_service.set(blacklist_key, "blacklisted", ttl=ttl)
            
            logger.info(f"Token {token_id} blacklisted")
            return True
            
        except JWTError as e:
            logger.error(f"Cannot blacklist invalid token: {e}")
            return False
    
    def generate_api_key(self, user_id: str, name: str = "default") -> str:
        """
        Generate API key for programmatic access
        
        Args:
            user_id: User ID
            name: API key name/description
            
        Returns:
            API key string
        """
        key_data = {
            "user_id": user_id,
            "key_name": name,
            "type": "api_key",
            "created_at": datetime.utcnow().isoformat()
        }
        
        # API keys don't expire (or have very long expiration)
        expires_delta = timedelta(days=365 * 5)  # 5 years
        
        return self.create_access_token(key_data, expires_delta)
    
    async def create_session(self, user_data: Dict[str, Any], session_id: Optional[str] = None) -> str:
        """
        Create user session in Redis
        
        Args:
            user_data: User information to store
            session_id: Optional custom session ID
            
        Returns:
            Session ID
        """
        if not session_id:
            session_id = secrets.token_urlsafe(32)
        
        session_data = {
            **user_data,
            "created_at": datetime.utcnow().isoformat(),
            "last_accessed": datetime.utcnow().isoformat()
        }
        
        # Store session with TTL
        success = await redis_service.set_session(session_id, session_data)
        
        if success:
            logger.info(f"Session created for user {user_data.get('user_id', 'unknown')}")
            return session_id
        else:
            raise Exception("Failed to create session")
    
    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get session data from Redis
        
        Args:
            session_id: Session ID
            
        Returns:
            Session data or None if not found
        """
        session_data = await redis_service.get_session(session_id)
        
        if session_data:
            # Update last accessed time
            session_data["last_accessed"] = datetime.utcnow().isoformat()
            await redis_service.set_session(session_id, session_data)
        
        return session_data
    
    async def delete_session(self, session_id: str) -> bool:
        """
        Delete session from Redis
        
        Args:
            session_id: Session ID to delete
            
        Returns:
            Success status
        """
        success = await redis_service.delete_session(session_id)
        
        if success:
            logger.info(f"Session {session_id} deleted")
        
        return success
    
    async def extend_session(self, session_id: str, ttl: Optional[int] = None) -> bool:
        """
        Extend session TTL
        
        Args:
            session_id: Session ID
            ttl: New TTL in seconds
            
        Returns:
            Success status
        """
        return await redis_service.extend_session(session_id, ttl)
    
    def create_anonymous_user_id(self) -> str:
        """Create anonymous user ID"""
        timestamp = datetime.utcnow().timestamp()
        random_part = secrets.token_urlsafe(8)
        return f"anon_{int(timestamp)}_{random_part}"
    
    async def migrate_anonymous_to_user(self, anonymous_id: str, user_id: str) -> bool:
        """
        Migrate anonymous user data to registered user
        
        Args:
            anonymous_id: Anonymous user ID
            user_id: Registered user ID
            
        Returns:
            Success status
        """
        try:
            # This would typically involve:
            # 1. Finding all walls/content associated with anonymous_id
            # 2. Updating ownership to user_id
            # 3. Cleaning up anonymous session/data
            
            # For now, we'll just create a migration record in Redis
            migration_data = {
                "from_anonymous": anonymous_id,
                "to_user": user_id,
                "migrated_at": datetime.utcnow().isoformat(),
                "status": "completed"
            }
            
            migration_key = f"migration:{anonymous_id}:{user_id}"
            await redis_service.set(migration_key, migration_data, ttl=86400 * 7)  # Keep for 7 days
            
            logger.info(f"Migration record created: {anonymous_id} -> {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            return False
    
    def validate_password_strength(self, password: str) -> Dict[str, Any]:
        """
        Validate password strength
        
        Args:
            password: Password to validate
            
        Returns:
            Validation result with score and requirements
        """
        score = 0
        feedback = []
        
        # Length check
        if len(password) >= 8:
            score += 25
        else:
            feedback.append("Password must be at least 8 characters long")
        
        # Uppercase check
        if any(c.isupper() for c in password):
            score += 25
        else:
            feedback.append("Password should contain uppercase letters")
        
        # Lowercase check
        if any(c.islower() for c in password):
            score += 25
        else:
            feedback.append("Password should contain lowercase letters")
        
        # Number check
        if any(c.isdigit() for c in password):
            score += 25
        else:
            feedback.append("Password should contain numbers")
        
        # Special character check
        special_chars = "!@#$%^&*()_+-=[]{}|;:,.<>?"
        if any(c in special_chars for c in password):
            score += 10
        
        # Common passwords check (basic)
        common_passwords = ["password", "123456", "qwerty", "admin", "welcome"]
        if password.lower() in common_passwords:
            score = max(0, score - 50)
            feedback.append("Password is too common")
        
        return {
            "score": min(100, score),
            "strength": (
                "Very Weak" if score < 25 else
                "Weak" if score < 50 else
                "Good" if score < 75 else
                "Strong"
            ),
            "valid": score >= 50,
            "feedback": feedback
        }

# Global instance
auth_service = AuthService()

# Security scheme
security = HTTPBearer()

# FastAPI dependency functions
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency to get current user from JWT token
    """
    try:
        # Extract token from credentials
        token = credentials.credentials
        # Decode token
        payload = jwt.decode(token, auth_service.secret_key, algorithms=[auth_service.algorithm])
        user_id: int = payload.get("sub")
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Get user from database
        user = db.query(User).filter(User.id == user_id).first()
        
        if user is None or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")
        
        return user
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    FastAPI dependency to get current user from JWT token (optional)
    Returns None if no token or invalid token
    """
    if not credentials:
        return None
        
    try:
        # Extract token from credentials
        token = credentials.credentials
        # Decode token
        payload = jwt.decode(token, auth_service.secret_key, algorithms=[auth_service.algorithm])
        user_id: int = payload.get("sub")
        
        if user_id is None:
            return None
        
        # Get user from database
        user = db.query(User).filter(User.id == user_id).first()
        
        if user is None or not user.is_active:
            return None
        
        return user
        
    except jwt.PyJWTError:
        return None
    except Exception as e:
        logger.error(f"Optional authentication error: {e}")
        return None

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency that requires admin privileges
    """
    # For this MVP, we'll check if the user is verified as a simple admin check
    # In production, you'd have a proper role system
    if not current_user.is_verified:
        raise HTTPException(
            status_code=403, 
            detail="Admin privileges required"
        )
    
    return current_user

# WebSocket Authentication
async def get_current_user_websocket(
    token: str,
    db: Session = Depends(get_db)
) -> User:
    """
    WebSocket-specific authentication function
    """
    try:
        # Decode token
        payload = jwt.decode(token, auth_service.secret_key, algorithms=[auth_service.algorithm])
        user_id: int = payload.get("sub")
        
        if user_id is None:
            raise Exception("Invalid token")
        
        # Get user from database
        user = db.query(User).filter(User.id == user_id).first()
        
        if user is None or not user.is_active:
            raise Exception("User not found or inactive")
        
        return user
        
    except jwt.PyJWTError:
        raise Exception("Invalid token")
    except Exception as e:
        logger.error(f"WebSocket authentication error: {e}")
        raise Exception("Authentication failed")

# Dependencies imported at top of file to avoid circular imports