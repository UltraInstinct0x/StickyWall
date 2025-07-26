# [[FastAPI Async Architecture]] - Backend Design

## Overview & Core Concepts

**FastAPI** provides the high-performance backend architecture for the [[Digital Wall]] project, leveraging async/await patterns for handling concurrent share processing, AI integration, and real-time features. This document covers advanced FastAPI patterns optimized for the Digital Wall's content processing pipeline.

### Core Architecture Principles
- **[[Async Processing]]**: Non-blocking I/O for handling multiple share requests
- **[[Dependency Injection]]**: Modular service architecture
- **[[Background Tasks]]**: Queue-based content processing
- **[[Database Async]]**: Non-blocking database operations with PostgreSQL
- **[[Caching Layer]]**: Redis integration for performance optimization

## Technical Deep Dive

### Application Structure and Initialization

```python
# main.py - FastAPI application setup
from fastapi import FastAPI, BackgroundTasks, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging
from typing import AsyncGenerator

from app.core.config import settings
from app.core.database import init_db, close_db
from app.core.redis import init_redis, close_redis
from app.core.ai import init_ai_client
from app.middleware.rate_limiting import RateLimitMiddleware
from app.routers import share, walls, ai, health

# Structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan management"""
    # Startup
    logger.info("Starting Digital Wall API...")
    
    await init_db()
    await init_redis()
    await init_ai_client()
    
    # Background task workers
    asyncio.create_task(start_background_workers())
    
    logger.info("Digital Wall API started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Digital Wall API...")
    await close_db()
    await close_redis()
    logger.info("Digital Wall API shutdown complete")

# Initialize FastAPI with async lifespan
app = FastAPI(
    title="Digital Wall API",
    description="Content curation and sharing platform API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None
)

# Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Include routers
app.include_router(share.router, prefix="/api/v1", tags=["sharing"])
app.include_router(walls.router, prefix="/api/v1", tags=["walls"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
app.include_router(health.router, prefix="/api/v1", tags=["health"])

async def start_background_workers():
    """Start background task workers"""
    from app.workers.content_processor import ContentProcessorWorker
    from app.workers.ai_analyzer import AIAnalyzerWorker
    
    await asyncio.gather(
        ContentProcessorWorker().start(),
        AIAnalyzerWorker().start()
    )
```

### Async Database Layer

```python
# app/core/database.py - Async database configuration
from sqlalchemy.ext.asyncio import (
    AsyncSession, 
    create_async_engine,
    async_sessionmaker
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
import asyncio

from app.core.config import settings

class Base(DeclarativeBase):
    pass

# Async engine with connection pooling
engine = create_async_engine(
    settings.ASYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=20,
    max_overflow=30,
    poolclass=NullPool if settings.ENVIRONMENT == "test" else None,
    echo=settings.ENVIRONMENT == "development"
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

async def init_db():
    """Initialize database connection and create tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def close_db():
    """Close database connections"""
    await engine.dispose()

async def get_db() -> AsyncSession:
    """Dependency to get database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# Connection health check
async def check_db_health() -> bool:
    """Check database connection health"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute("SELECT 1")
            return result.scalar() == 1
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False
```

### Share Processing Router

```python
# app/routers/share.py - Async share processing endpoints
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import asyncio
import uuid

from app.core.database import get_db
from app.core.redis import get_redis
from app.schemas.share import ShareRequest, ShareResponse, ProcessingStatus
from app.services.content_processor import ContentProcessorService
from app.services.wall_service import WallService
from app.services.ai_service import AIService
from app.utils.validation import validate_share_content
from app.utils.rate_limiting import rate_limit

router = APIRouter()

@router.post("/share", response_model=ShareResponse)
async def process_share(
    share_request: ShareRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    redis = Depends(get_redis),
    rate_limit: None = Depends(rate_limit("share", requests=10, window=60))
):
    """Process shared content with async pipeline"""
    try:
        # Generate processing ID
        processing_id = str(uuid.uuid4())
        
        # Quick validation
        validation_result = await validate_share_content(share_request)
        if not validation_result.valid:
            raise HTTPException(
                status_code=400, 
                detail=validation_result.error
            )
        
        # Store initial processing status
        await redis.setex(
            f"processing:{processing_id}",
            3600,  # 1 hour TTL
            "started"
        )
        
        # Quick response for better UX
        response = ShareResponse(
            processing_id=processing_id,
            status="processing",
            estimated_completion_seconds=5
        )
        
        # Background processing pipeline
        background_tasks.add_task(
            process_share_pipeline,
            share_request,
            processing_id,
            db,
            redis
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Share processing error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

async def process_share_pipeline(
    share_request: ShareRequest,
    processing_id: str,
    db: AsyncSession,
    redis
):
    """Complete async processing pipeline"""
    try:
        # Update status
        await redis.setex(f"processing:{processing_id}", 3600, "analyzing")
        
        # Parallel processing tasks
        tasks = []
        
        # AI analysis task
        ai_service = AIService()
        ai_task = asyncio.create_task(
            ai_service.analyze_content(share_request.content)
        )
        tasks.append(("ai_analysis", ai_task))
        
        # Content extraction task (if URL)
        if share_request.url:
            content_service = ContentProcessorService()
            content_task = asyncio.create_task(
                content_service.extract_metadata(share_request.url)
            )
            tasks.append(("metadata", content_task))
        
        # File processing task (if files)
        if share_request.files:
            file_task = asyncio.create_task(
                process_files_async(share_request.files)
            )
            tasks.append(("files", file_task))
        
        # Wait for all tasks with timeout
        results = {}
        for task_name, task in tasks:
            try:
                result = await asyncio.wait_for(task, timeout=30.0)
                results[task_name] = result
            except asyncio.TimeoutError:
                logger.warning(f"Task {task_name} timed out for {processing_id}")
                results[task_name] = None
            except Exception as e:
                logger.error(f"Task {task_name} failed for {processing_id}: {e}")
                results[task_name] = None
        
        # Update status
        await redis.setex(f"processing:{processing_id}", 3600, "storing")
        
        # Combine results and store
        processed_content = combine_processing_results(
            share_request, 
            results
        )
        
        # Store to wall
        wall_service = WallService(db)
        wall_item = await wall_service.add_item(
            user_id=share_request.user_id,
            content=processed_content
        )
        
        # Final status update
        await redis.setex(
            f"processing:{processing_id}",
            3600,
            f"completed:{wall_item.id}"
        )
        
        logger.info(f"Share processing completed: {processing_id}")
        
    except Exception as e:
        logger.error(f"Pipeline processing error for {processing_id}: {e}")
        await redis.setex(f"processing:{processing_id}", 3600, f"error:{str(e)}")

@router.get("/share/status/{processing_id}")
async def get_processing_status(
    processing_id: str,
    redis = Depends(get_redis)
) -> ProcessingStatus:
    """Get processing status for async operations"""
    try:
        status = await redis.get(f"processing:{processing_id}")
        
        if not status:
            raise HTTPException(status_code=404, detail="Processing ID not found")
        
        status_str = status.decode() if isinstance(status, bytes) else status
        
        if status_str == "started":
            return ProcessingStatus(
                processing_id=processing_id,
                status="processing",
                progress=0.1,
                message="Starting content analysis..."
            )
        elif status_str == "analyzing":
            return ProcessingStatus(
                processing_id=processing_id,
                status="processing", 
                progress=0.5,
                message="Analyzing content with AI..."
            )
        elif status_str == "storing":
            return ProcessingStatus(
                processing_id=processing_id,
                status="processing",
                progress=0.9,
                message="Saving to your wall..."
            )
        elif status_str.startswith("completed:"):
            item_id = status_str.split(":")[1]
            return ProcessingStatus(
                processing_id=processing_id,
                status="completed",
                progress=1.0,
                message="Content successfully added to your wall!",
                result_id=item_id
            )
        elif status_str.startswith("error:"):
            error_msg = status_str.split(":", 1)[1]
            return ProcessingStatus(
                processing_id=processing_id,
                status="error",
                progress=0.0,
                message=f"Processing failed: {error_msg}"
            )
        else:
            return ProcessingStatus(
                processing_id=processing_id,
                status="unknown",
                progress=0.0,
                message="Unknown processing status"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Status check error: {e}")
        raise HTTPException(status_code=500, detail="Status check failed")
```

### AI Service Integration

```python
# app/services/ai_service.py - Async AI processing service
import asyncio
import aiohttp
from typing import Dict, Any, Optional
from anthropic import AsyncAnthropic

from app.core.config import settings
from app.schemas.ai import ContentAnalysis, AIProcessingError

class AIService:
    def __init__(self):
        self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def analyze_content(
        self, 
        content: Dict[str, Any],
        timeout: float = 30.0
    ) -> ContentAnalysis:
        """Analyze content with Claude Sonnet 4"""
        try:
            # Prepare analysis prompt
            prompt = self._build_analysis_prompt(content)
            
            # Async Claude API call with timeout
            response = await asyncio.wait_for(
                self.client.messages.create(
                    model="claude-3-sonnet-20240229",
                    max_tokens=2000,
                    temperature=0.1,
                    messages=[{
                        "role": "user",
                        "content": prompt
                    }]
                ),
                timeout=timeout
            )
            
            # Parse AI response
            analysis_text = response.content[0].text
            analysis = self._parse_analysis_response(analysis_text)
            
            return ContentAnalysis(
                title=analysis.get("title", "Shared Content"),
                description=analysis.get("description", ""),
                tags=analysis.get("tags", []),
                category=analysis.get("category", "general"),
                sentiment=analysis.get("sentiment", "neutral"),
                key_topics=analysis.get("key_topics", []),
                confidence_score=analysis.get("confidence", 0.8)
            )
            
        except asyncio.TimeoutError:
            logger.warning("AI analysis timed out")
            return self._fallback_analysis(content)
        except Exception as e:
            logger.error(f"AI analysis error: {e}")
            raise AIProcessingError(f"AI analysis failed: {str(e)}")
    
    def _build_analysis_prompt(self, content: Dict[str, Any]) -> str:
        """Build structured prompt for content analysis"""
        return f"""
        Analyze the following content and provide a structured analysis:
        
        Content Type: {content.get('type', 'unknown')}
        URL: {content.get('url', 'N/A')}
        Text: {content.get('text', 'N/A')}
        Title: {content.get('title', 'N/A')}
        
        Please provide analysis in JSON format:
        {{
            "title": "extracted or improved title",
            "description": "brief description of content",
            "tags": ["relevant", "tags", "here"],
            "category": "technology|entertainment|news|social|other",
            "sentiment": "positive|negative|neutral",
            "key_topics": ["main", "topics"],
            "confidence": 0.0-1.0
        }}
        """
    
    def _parse_analysis_response(self, response: str) -> Dict[str, Any]:
        """Parse AI response into structured data"""
        import json
        import re
        
        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Fallback parsing
        return {
            "title": "Analyzed Content",
            "description": response[:200] + "..." if len(response) > 200 else response,
            "tags": ["ai-analyzed"],
            "category": "general",
            "sentiment": "neutral",
            "key_topics": [],
            "confidence": 0.5
        }
    
    def _fallback_analysis(self, content: Dict[str, Any]) -> ContentAnalysis:
        """Fallback analysis when AI fails"""
        return ContentAnalysis(
            title=content.get('title', 'Shared Content'),
            description=content.get('text', '')[:200] + "..." if content.get('text', '') else '',
            tags=["shared"],
            category="general",
            sentiment="neutral",
            key_topics=[],
            confidence_score=0.3
        )

    async def batch_analyze(
        self, 
        content_list: List[Dict[str, Any]],
        max_concurrent: int = 5
    ) -> List[ContentAnalysis]:
        """Batch process multiple content items"""
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def analyze_with_semaphore(content):
            async with semaphore:
                return await self.analyze_content(content)
        
        tasks = [analyze_with_semaphore(content) for content in content_list]
        return await asyncio.gather(*tasks, return_exceptions=True)
```

## Development Patterns

### Background Task Processing

```python
# app/workers/content_processor.py - Background worker pattern
import asyncio
import json
from typing import Dict, Any
from redis import Redis

from app.core.database import AsyncSessionLocal
from app.services.ai_service import AIService
from app.services.wall_service import WallService

class ContentProcessorWorker:
    def __init__(self):
        self.redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        self.running = False
    
    async def start(self):
        """Start the background worker"""
        self.running = True
        logger.info("Content processor worker started")
        
        while self.running:
            try:
                # Process queue items
                await self._process_queue()
                await asyncio.sleep(1)  # Polling interval
                
            except Exception as e:
                logger.error(f"Worker error: {e}")
                await asyncio.sleep(5)  # Error backoff
    
    async def stop(self):
        """Stop the background worker"""
        self.running = False
        logger.info("Content processor worker stopped")
    
    async def _process_queue(self):
        """Process items from the content queue"""
        # Get next item from queue (blocking with timeout)
        queue_item = self.redis.blpop('content_processing_queue', timeout=5)
        
        if not queue_item:
            return
        
        try:
            # Parse queue item
            _, item_data = queue_item
            content_data = json.loads(item_data)
            
            # Process with database session
            async with AsyncSessionLocal() as db:
                await self._process_content_item(content_data, db)
                
        except Exception as e:
            logger.error(f"Queue item processing error: {e}")
            # Could implement retry logic here
    
    async def _process_content_item(self, content_data: Dict[str, Any], db):
        """Process individual content item"""
        try:
            # AI analysis
            ai_service = AIService()
            analysis = await ai_service.analyze_content(content_data['content'])
            
            # Update wall item with analysis
            wall_service = WallService(db)
            await wall_service.update_item(
                item_id=content_data['item_id'],
                analysis=analysis
            )
            
            logger.info(f"Processed content item: {content_data['item_id']}")
            
        except Exception as e:
            logger.error(f"Content processing error: {e}")
            # Mark item as failed
            await wall_service.mark_processing_failed(
                content_data['item_id'], 
                str(e)
            )

# Queue management utilities
async def enqueue_content_processing(item_data: Dict[str, Any]):
    """Add item to processing queue"""
    redis = Redis.from_url(settings.REDIS_URL)
    await redis.rpush('content_processing_queue', json.dumps(item_data))

async def get_queue_status() -> Dict[str, int]:
    """Get queue status information"""
    redis = Redis.from_url(settings.REDIS_URL)
    return {
        'pending_items': await redis.llen('content_processing_queue'),
        'failed_items': await redis.llen('failed_processing_queue'),
        'processing_items': await redis.llen('processing_items_set')
    }
```

### Error Handling and Resilience

```python
# app/utils/resilience.py - Resilience patterns
import asyncio
import functools
from typing import Callable, Any, Optional
import logging

logger = logging.getLogger(__name__)

def async_retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple = (Exception,)
):
    """Async retry decorator with exponential backoff"""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            last_exception = None
            current_delay = delay
            
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt == max_attempts - 1:
                        break
                    
                    logger.warning(
                        f"Attempt {attempt + 1} failed for {func.__name__}: {e}. "
                        f"Retrying in {current_delay}s..."
                    )
                    
                    await asyncio.sleep(current_delay)
                    current_delay *= backoff
            
            logger.error(f"All {max_attempts} attempts failed for {func.__name__}")
            raise last_exception
        
        return wrapper
    return decorator

def async_circuit_breaker(
    failure_threshold: int = 5,
    reset_timeout: float = 60.0
):
    """Async circuit breaker pattern"""
    def decorator(func: Callable) -> Callable:
        failure_count = 0
        last_failure_time: Optional[float] = None
        
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            nonlocal failure_count, last_failure_time
            
            # Check if circuit should be reset
            if (last_failure_time and 
                time.time() - last_failure_time > reset_timeout):
                failure_count = 0
                last_failure_time = None
            
            # Check if circuit is open
            if failure_count >= failure_threshold:
                raise CircuitBreakerOpenError(
                    f"Circuit breaker open for {func.__name__}"
                )
            
            try:
                result = await func(*args, **kwargs)
                # Reset on success
                failure_count = 0
                last_failure_time = None
                return result
                
            except Exception as e:
                failure_count += 1
                last_failure_time = time.time()
                
                logger.warning(
                    f"Circuit breaker failure {failure_count}/{failure_threshold} "
                    f"for {func.__name__}: {e}"
                )
                
                raise
        
        return wrapper
    return decorator

class CircuitBreakerOpenError(Exception):
    pass

# Usage examples
@async_retry(max_attempts=3, delay=1.0, backoff=2.0)
@async_circuit_breaker(failure_threshold=5, reset_timeout=60.0)
async def reliable_ai_call(content: str) -> Dict[str, Any]:
    """Example of resilient AI service call"""
    ai_service = AIService()
    return await ai_service.analyze_content(content)
```

## Production Considerations

### Performance Monitoring

```python
# app/middleware/monitoring.py - Performance monitoring
import time
import logging
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

class PerformanceMonitoringMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Add request ID for tracing
        request_id = request.headers.get('x-request-id', str(uuid.uuid4())[:8])
        
        # Process request
        response = await call_next(request)
        
        # Calculate metrics
        process_time = time.time() - start_time
        
        # Log performance metrics
        logger.info(
            f"Request: {request_id} | "
            f"Method: {request.method} | "
            f"URL: {request.url.path} | "
            f"Status: {response.status_code} | "
            f"Duration: {process_time:.3f}s"
        )
        
        # Add performance headers
        response.headers["X-Process-Time"] = str(process_time)
        response.headers["X-Request-ID"] = request_id
        
        # Alert on slow requests
        if process_time > 5.0:
            logger.warning(
                f"Slow request detected: {request_id} took {process_time:.3f}s"
            )
        
        return response

# Health check endpoint
@router.get("/health")
async def health_check():
    """Comprehensive health check"""
    health_status = {
        "status": "healthy",
        "timestamp": time.time(),
        "services": {}
    }
    
    # Check database
    try:
        db_healthy = await check_db_health()
        health_status["services"]["database"] = {
            "status": "healthy" if db_healthy else "unhealthy",
            "response_time": await measure_db_response_time()
        }
    except Exception as e:
        health_status["services"]["database"] = {
            "status": "error",
            "error": str(e)
        }
    
    # Check Redis
    try:
        redis_healthy = await check_redis_health()
        health_status["services"]["redis"] = {
            "status": "healthy" if redis_healthy else "unhealthy"
        }
    except Exception as e:
        health_status["services"]["redis"] = {
            "status": "error", 
            "error": str(e)
        }
    
    # Check AI service
    try:
        ai_healthy = await check_ai_service_health()
        health_status["services"]["ai"] = {
            "status": "healthy" if ai_healthy else "unhealthy"
        }
    except Exception as e:
        health_status["services"]["ai"] = {
            "status": "error",
            "error": str(e)
        }
    
    # Determine overall status
    unhealthy_services = [
        name for name, service in health_status["services"].items()
        if service["status"] != "healthy"
    ]
    
    if unhealthy_services:
        health_status["status"] = "degraded"
        health_status["issues"] = unhealthy_services
    
    return health_status
```

## Integration Examples

### Complete Async Architecture

```mermaid
graph TD
    A[Client Request] --> B[FastAPI App]
    B --> C[CORS Middleware]
    C --> D[Rate Limiting]
    D --> E[Performance Monitoring]
    E --> F[Route Handler]
    
    F --> G[Dependency Injection]
    G --> H[Database Session]
    G --> I[Redis Cache]
    G --> J[AI Service]
    
    F --> K[Background Tasks]
    K --> L[Queue Processing]
    L --> M[Worker Pool]
    
    subgraph "Async Processing"
        N[Content Analysis]
        O[AI Processing]
        P[File Processing]
    end
    
    M --> N
    M --> O
    M --> P
    
    N --> Q[[[Cloudflare R2 Storage]]]
    O --> R[[[Claude Sonnet 4 Integration]]]
    P --> S[Database Storage]
    
    S --> T[Response]
    T --> A
```

### Integration with [[Digital Wall]] Components

- **[[Next.js 14 PWA Patterns]]**: API endpoints for PWA share processing
- **[[Claude Sonnet 4 Integration]]**: AI service integration layer
- **[[Cloudflare R2 Storage]]**: Async file upload and retrieval
- **[[Content Processing Pipeline]]**: Background task orchestration
- **[[Redis Caching]]**: Session management and queue processing

## References & Further Reading

### Official Documentation
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [asyncio Documentation](https://docs.python.org/3/library/asyncio.html)

### Performance Guides
- [FastAPI Performance](https://fastapi.tiangolo.com/benchmarks/)
- [Async Python Best Practices](https://docs.python.org/3/library/asyncio-dev.html)

### Related [[Vault]] Concepts
- [[Async Programming]] - Asynchronous programming patterns
- [[Dependency Injection]] - Service architecture patterns
- [[Background Tasks]] - Queue and worker patterns
- [[Database Async]] - Non-blocking database operations
- [[API Design]] - REST API best practices

#digital-wall #research #fastapi #async #python #backend