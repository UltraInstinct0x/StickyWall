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

# Create async engine
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=True,
    poolclass=StaticPool,
    connect_args={"check_same_thread": False} if "sqlite" in ASYNC_DATABASE_URL else {}
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
    from app.models.models import User, Wall, ShareItem
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)