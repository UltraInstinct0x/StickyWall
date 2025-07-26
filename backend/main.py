from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio

from app.api.endpoints import health, share, walls, enhanced, auth, users, analytics, search, documentation, websocket, ai_advanced
from app.core.database import init_db
from app.services.redis_service import redis_service
from app.services.background_processor import background_processor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown events."""
    logger.info("Starting Digital Wall MVP application...")
    
    # Startup: Initialize services
    try:
        # Initialize database
        await init_db()
        logger.info("Database initialized")
        
        # Check Redis connection (already initialized in constructor)
        redis_status = await redis_service.health_check()
        logger.info(f"Redis connection status: {'Connected' if redis_status else 'Using memory cache fallback'}")
        
        # Store services in app state
        app.state.redis = redis_service
        app.state.background_processor = background_processor
        
        logger.info("All services initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise
    
    yield
    
    # Shutdown: Cleanup
    try:
        await redis_service.disconnect()
        logger.info("Services cleaned up successfully")
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Digital Wall MVP - Complete Implementation",
        description="A comprehensive PWA for capturing, analyzing, and organizing shared content with AI-powered insights",
        version="2.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan
    )
    
    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include routers
    app.include_router(health.router, prefix="/api", tags=["health"])
    app.include_router(share.router, prefix="/api", tags=["share"])
    app.include_router(walls.router, prefix="/api", tags=["walls"])
    app.include_router(enhanced.router, tags=["enhanced"])
    app.include_router(auth.router, tags=["authentication"])
    app.include_router(users.router, tags=["users"])
    app.include_router(analytics.router, tags=["analytics"])
    app.include_router(search.router, tags=["search"])
    app.include_router(documentation.router, tags=["documentation"])
    app.include_router(websocket.router, tags=["websocket"])
    app.include_router(ai_advanced.router, tags=["advanced-ai"])
    
    return app


app = create_app()


@app.get("/")
async def root():
    """Root endpoint with system status."""
    return {
        "message": "Digital Wall MVP - Phase 3 Complete Implementation",
        "status": "running",
        "version": "2.0.0",
        "features": {
            "native_mobile": "React Native with iOS/Android share extensions",
            "storage": "Cloudflare R2 with optimization",
            "ai_analysis": "Claude Sonnet 4 content analysis",
            "background_processing": "Celery with Redis queue",
            "caching": "Redis-powered caching layer",
            "real_time": "WebSocket support for live updates"
        },
        "endpoints": {
            "docs": "/docs",
            "health": "/api/health",
            "share": "/api/share",
            "walls": "/api/walls",
            "analyze": "/api/v2/analyze",
            "upload": "/api/v2/upload",
            "enhance": "/api/v2/enhance",
            "tasks": "/api/v2/tasks/{task_id}/status",
            "queue_stats": "/api/v2/queue/stats",
            "auth": {
                "register": "/api/auth/register",
                "login": "/api/auth/login",
                "logout": "/api/auth/logout",
                "me": "/api/auth/me",
                "change_password": "/api/auth/change-password",
                "refresh": "/api/auth/refresh-token"
            },
            "celery_monitor": ":5555 (Flower)"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)