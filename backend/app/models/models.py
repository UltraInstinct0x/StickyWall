from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    """User model for anonymous and registered users."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Authentication fields
    username = Column(String(50), unique=True, nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)  # None for anonymous users
    
    # User profile
    full_name = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    
    # Account status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_anonymous = Column(Boolean, default=True)
    
    # Session management
    session_id = Column(String(255), unique=True, nullable=True, index=True)  # For anonymous users
    last_login = Column(DateTime, nullable=True)
    
    # User data
    settings = Column(JSON, default=dict)  # User preferences
    user_metadata = Column(JSON, default=dict)  # Additional user data
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    walls = relationship("Wall", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")


class APIKey(Base):
    """API key model for programmatic access."""
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    name = Column(String(255), nullable=False)  # Human readable name
    key_hash = Column(String(255), nullable=False, unique=True, index=True)
    key_prefix = Column(String(16), nullable=False)  # First few chars for display
    
    # Permissions and limits
    scopes = Column(JSON, default=list)  # List of allowed scopes
    rate_limit = Column(Integer, default=1000)  # Requests per hour
    
    # Status
    is_active = Column(Boolean, default=True)
    last_used = Column(DateTime, nullable=True)
    usage_count = Column(Integer, default=0)
    
    # Timestamps
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="api_keys")


class UserSession(Base):
    """User session model for tracking active sessions."""
    __tablename__ = "user_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    session_token = Column(String(255), unique=True, nullable=False, index=True)
    refresh_token = Column(String(255), unique=True, nullable=True, index=True)
    
    # Session metadata
    device_info = Column(JSON, default=dict)  # Browser, OS, etc.
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(Text, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    last_accessed = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User")


class PasswordReset(Base):
    """Password reset token model."""
    __tablename__ = "password_resets"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    token = Column(String(255), unique=True, nullable=False, index=True)
    is_used = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User")


class Wall(Base):
    """Wall model for organizing shared content."""
    __tablename__ = "walls"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), default="My Wall")
    description = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Wall settings
    is_public = Column(Boolean, default=False)
    is_featured = Column(Boolean, default=False)
    is_default = Column(Integer, default=0)  # Using Integer for SQLite compatibility
    settings = Column(JSON, default=dict)
    
    # Wall data
    wall_metadata = Column(JSON, default=dict)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="walls")
    items = relationship("ShareItem", back_populates="wall", cascade="all, delete-orphan")


class ShareItem(Base):
    """Share item model for storing shared content."""
    __tablename__ = "share_items"
    
    id = Column(Integer, primary_key=True, index=True)
    wall_id = Column(Integer, ForeignKey("walls.id"), nullable=False)
    title = Column(String(500), nullable=True)
    text = Column(Text, nullable=True)
    url = Column(String(2048), nullable=True)
    content_type = Column(String(50), nullable=True)  # 'url', 'text', 'image', 'video', 'pdf'
    file_path = Column(String(1024), nullable=True)  # For uploaded files
    item_metadata = Column(JSON, default=dict)  # Store additional metadata
    processed = Column(Integer, default=0)  # For AI processing status
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    wall = relationship("Wall", back_populates="items")