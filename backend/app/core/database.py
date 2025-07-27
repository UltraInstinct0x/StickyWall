import os
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import StaticPool

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./digital_wall.db")

# Convert sync sqlite URL to async for SQLAlchemy 2.0
if DATABASE_URL.startswith("sqlite:///"):
    ASYNC_DATABASE_URL = DATABASE_URL.replace("sqlite:///", "sqlite+aiosqlite:///")
else:
    ASYNC_DATABASE_URL = DATABASE_URL

# Create async engine with proper configuration for SQLite
if "sqlite" in ASYNC_DATABASE_URL:
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,  # Disable verbose logging
        poolclass=StaticPool,
        pool_pre_ping=True,  # Test connections before use
        connect_args={
            "check_same_thread": False,
            "timeout": 30  # 30 second timeout for SQLite operations
        }
    )
else:
    # For PostgreSQL with proper pooling
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=False,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=3600
    )

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Create declarative base
Base = declarative_base()
metadata = MetaData()


async def get_db():
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def get_db_session():
    """Get a database session (not a dependency)."""
    return AsyncSessionLocal()


async def init_db():
    """Initialize database tables."""
    from app.models.models import User, Wall, ShareItem, OEmbedData, OEmbedCache, APIKey, UserSession, PasswordReset

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
