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
    content_type = Column(String(50), nullable=True)  # 'url', 'text', 'image', 'video', 'pdf', 'oembed'
    file_path = Column(String(1024), nullable=True)  # For uploaded files
    item_metadata = Column(JSON, default=dict)  # Store additional metadata
    processed = Column(Integer, default=0)  # For AI processing status

    # oEmbed support
    has_oembed = Column(Boolean, default=False)  # Whether this item has oEmbed data
    oembed_processed = Column(Boolean, default=False)  # Whether oEmbed extraction was attempted

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    wall = relationship("Wall", back_populates="items")
    oembed_data = relationship("OEmbedData", back_populates="share_item", uselist=False, cascade="all, delete-orphan")


class OEmbedData(Base):
    """Model for storing oEmbed data for shared content."""
    __tablename__ = "oembed_data"

    id = Column(Integer, primary_key=True, index=True)
    share_item_id = Column(Integer, ForeignKey("share_items.id"), nullable=False, unique=True)

    # Standard oEmbed fields
    oembed_type = Column(String(20), nullable=False)  # "video", "photo", "link", "rich"
    version = Column(String(10), default="1.0")
    title = Column(String(1000), nullable=True)
    author_name = Column(String(255), nullable=True)
    author_url = Column(String(2048), nullable=True)
    provider_name = Column(String(255), nullable=True)
    provider_url = Column(String(2048), nullable=True)
    cache_age = Column(Integer, nullable=True)

    # Thumbnail data
    thumbnail_url = Column(String(2048), nullable=True)
    thumbnail_width = Column(Integer, nullable=True)
    thumbnail_height = Column(Integer, nullable=True)

    # Content data (type-specific)
    content_url = Column(String(2048), nullable=True)  # For photo type
    width = Column(Integer, nullable=True)    # For photo/video type
    height = Column(Integer, nullable=True)   # For photo/video type
    html = Column(Text, nullable=True)        # For video/rich type

    # Platform-specific fields
    platform = Column(String(50), nullable=True)  # e.g., "youtube", "twitter", "instagram"
    platform_id = Column(String(255), nullable=True)  # Platform-specific content ID
    description = Column(Text, nullable=True)
    duration = Column(Integer, nullable=True)  # Duration in seconds for video/audio
    view_count = Column(Integer, nullable=True)
    like_count = Column(Integer, nullable=True)
    comment_count = Column(Integer, nullable=True)
    share_count = Column(Integer, nullable=True)
    published_at = Column(DateTime, nullable=True)  # When content was published on platform

    # Local storage
    local_thumbnail_path = Column(String(1024), nullable=True)  # Path to locally stored thumbnail
    local_content_path = Column(String(1024), nullable=True)   # Path to locally stored content

    # Processing status
    extraction_status = Column(String(20), default="pending")  # "pending", "success", "failed", "partial"
    extraction_error = Column(Text, nullable=True)  # Error message if extraction failed
    last_updated = Column(DateTime, nullable=True)  # When oEmbed data was last refreshed

    # Additional metadata
    raw_oembed_data = Column(JSON, default=dict)  # Store complete raw oEmbed response
    platform_metadata = Column(JSON, default=dict)  # Platform-specific additional data

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    share_item = relationship("ShareItem", back_populates="oembed_data")


class OEmbedCache(Base):
    """Cache for oEmbed responses to reduce API calls."""
    __tablename__ = "oembed_cache"

    id = Column(Integer, primary_key=True, index=True)
    url_hash = Column(String(64), unique=True, nullable=False, index=True)  # SHA256 hash of URL
    original_url = Column(String(2048), nullable=False)

    # Cached response
    oembed_response = Column(JSON, nullable=False)  # Complete oEmbed response
    status_code = Column(Integer, nullable=False)   # HTTP status code

    # Cache metadata
    cache_key = Column(String(255), nullable=True)  # Additional cache key if needed
    platform = Column(String(50), nullable=True)   # Platform for easier querying

    # Cache control
    expires_at = Column(DateTime, nullable=False)   # When cache expires
    hit_count = Column(Integer, default=0)          # Number of times cache was used
    last_hit = Column(DateTime, nullable=True)      # Last time cache was accessed

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
