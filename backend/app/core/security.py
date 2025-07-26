"""
Security middleware and configuration
DMCA, rate limiting, content moderation
"""
from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
import time
import hashlib
from typing import Dict, Optional
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta

from app.services.redis_service import redis_service

logger = logging.getLogger(__name__)

class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Security middleware for rate limiting, CORS, and request validation
    """
    
    def __init__(self, app, rate_limit: int = 100):
        super().__init__(app)
        self.rate_limit = rate_limit
        self.rate_limit_window = 60  # 1 minute
        
    async def dispatch(self, request: Request, call_next):
        # Rate limiting
        client_ip = self._get_client_ip(request)
        
        if await self._is_rate_limited(client_ip):
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Maximum {self.rate_limit} requests per minute",
                    "retry_after": 60
                }
            )
        
        # Security headers
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "connect-src 'self' https:; "
            "frame-ancestors 'none'"
        )
        
        return response
    
    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address from request"""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host
    
    async def _is_rate_limited(self, client_ip: str) -> bool:
        """Check if client IP is rate limited"""
        try:
            key = f"rate_limit:{client_ip}"
            current_requests = await redis_service.get_counter(key)
            
            if current_requests >= self.rate_limit:
                return True
            
            # Increment counter
            await redis_service.increment_counter(key)
            
            # Set TTL if this is the first request
            if current_requests == 0:
                await redis_service.redis.expire(key, self.rate_limit_window)
            
            return False
            
        except Exception as e:
            logger.error(f"Rate limiting error: {e}")
            return False  # Allow request if rate limiting fails

class DMCAHandler:
    """
    DMCA notice handling system
    """
    
    def __init__(self):
        self.automated_takedown = True
        self.notice_retention_days = 365
    
    async def submit_dmca_notice(
        self,
        complainant_name: str,
        complainant_email: str,
        copyrighted_work: str,
        infringing_content_url: str,
        sworn_statement: bool,
        signature: str
    ) -> Dict:
        """
        Submit a DMCA takedown notice
        """
        try:
            # Validate required fields
            if not all([
                complainant_name,
                complainant_email, 
                copyrighted_work,
                infringing_content_url,
                sworn_statement,
                signature
            ]):
                raise ValueError("All DMCA notice fields are required")
            
            notice_id = hashlib.sha256(
                f"{complainant_email}{infringing_content_url}{time.time()}".encode()
            ).hexdigest()[:16]
            
            # Store DMCA notice
            notice_data = {
                "id": notice_id,
                "complainant_name": complainant_name,
                "complainant_email": complainant_email,
                "copyrighted_work": copyrighted_work,
                "infringing_content_url": infringing_content_url,
                "sworn_statement": sworn_statement,
                "signature": signature,
                "submitted_at": datetime.utcnow().isoformat(),
                "status": "submitted",
                "processed": False
            }
            
            notice_key = f"dmca_notice:{notice_id}"
            ttl = self.notice_retention_days * 24 * 3600  # Convert to seconds
            await redis_service.set(notice_key, notice_data, ttl=ttl)
            
            # Process takedown if automated
            if self.automated_takedown:
                await self._process_takedown(notice_id, infringing_content_url)
            
            logger.info(f"DMCA notice submitted: {notice_id}")
            
            return {
                "success": True,
                "notice_id": notice_id,
                "status": "submitted",
                "automated_takedown": self.automated_takedown,
                "message": "DMCA notice received and will be processed within 24 hours"
            }
            
        except Exception as e:
            logger.error(f"DMCA notice submission failed: {e}")
            raise HTTPException(status_code=400, detail=str(e))
    
    async def _process_takedown(self, notice_id: str, content_url: str):
        """
        Process automated content takedown
        """
        try:
            # Extract content ID from URL
            content_id = self._extract_content_id(content_url)
            
            if content_id:
                # Mark content as removed
                takedown_key = f"takedown:{content_id}"
                takedown_data = {
                    "dmca_notice_id": notice_id,
                    "content_url": content_url,
                    "taken_down_at": datetime.utcnow().isoformat(),
                    "status": "removed"
                }
                
                await redis_service.set(takedown_key, takedown_data, ttl=86400 * 365)
                
                logger.info(f"Content taken down: {content_id} (DMCA: {notice_id})")
                
        except Exception as e:
            logger.error(f"Takedown processing failed: {e}")
    
    def _extract_content_id(self, content_url: str) -> Optional[str]:
        """Extract content ID from URL"""
        try:
            # Simple URL parsing - in production, this would be more sophisticated
            parts = content_url.strip("/").split("/")
            if len(parts) >= 2 and parts[-2] in ["walls", "items", "content"]:
                return parts[-1]
            return None
        except Exception:
            return None
    
    async def check_content_status(self, content_id: str) -> Dict:
        """
        Check if content has been taken down
        """
        takedown_key = f"takedown:{content_id}"
        takedown_data = await redis_service.get(takedown_key)
        
        if takedown_data:
            return {
                "taken_down": True,
                "dmca_notice_id": takedown_data.get("dmca_notice_id"),
                "taken_down_at": takedown_data.get("taken_down_at"),
                "status": takedown_data.get("status")
            }
        
        return {"taken_down": False}

class ContentModerator:
    """
    Content moderation system
    """
    
    def __init__(self):
        self.blocked_domains = {
            "spam.com", "malicious.net", "phishing.org"
        }
        
        self.blocked_keywords = {
            "spam", "scam", "phishing", "malware", 
            "inappropriate", "explicit", "harmful"
        }
    
    async def moderate_content(
        self,
        title: Optional[str] = None,
        text: Optional[str] = None,
        url: Optional[str] = None
    ) -> Dict:
        """
        Moderate content for policy violations
        """
        violations = []
        
        # Check blocked domains
        if url and self._check_blocked_domain(url):
            violations.append("blocked_domain")
        
        # Check content for blocked keywords
        content_text = f"{title or ''} {text or ''}".lower()
        if self._check_blocked_keywords(content_text):
            violations.append("blocked_keywords")
        
        # Check content length
        if text and len(text) > 10000:  # 10k character limit
            violations.append("content_too_long")
        
        return {
            "approved": len(violations) == 0,
            "violations": violations,
            "action": "block" if violations else "approve",
            "message": self._get_violation_message(violations)
        }
    
    def _check_blocked_domain(self, url: str) -> bool:
        """Check if URL contains blocked domain"""
        try:
            from urllib.parse import urlparse
            domain = urlparse(url.lower()).netloc
            return any(blocked in domain for blocked in self.blocked_domains)
        except Exception:
            return False
    
    def _check_blocked_keywords(self, text: str) -> bool:
        """Check if text contains blocked keywords"""
        return any(keyword in text for keyword in self.blocked_keywords)
    
    def _get_violation_message(self, violations: list) -> str:
        """Get human-readable violation message"""
        if not violations:
            return "Content approved"
        
        messages = {
            "blocked_domain": "URL contains blocked domain",
            "blocked_keywords": "Content contains inappropriate keywords", 
            "content_too_long": "Content exceeds length limit"
        }
        
        return "; ".join(messages.get(v, v) for v in violations)

class InputValidator:
    """
    Input validation and sanitization
    """
    
    @staticmethod
    def sanitize_string(value: str, max_length: int = 1000) -> str:
        """Sanitize string input"""
        if not isinstance(value, str):
            return ""
        
        # Remove null bytes and control characters
        value = "".join(char for char in value if ord(char) >= 32 or char in "\n\r\t")
        
        # Truncate to max length
        return value[:max_length].strip()
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        import re
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    @staticmethod
    def validate_url(url: str) -> bool:
        """Validate URL format"""
        try:
            from urllib.parse import urlparse
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Sanitize filename for safe storage"""
        import re
        # Remove path separators and dangerous characters
        filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', filename)
        # Limit length
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        name = name[:100]  # Limit name to 100 chars
        return f"{name}.{ext}" if ext else name

from passlib.context import CryptContext

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

# Global instances
security_middleware = SecurityMiddleware
dmca_handler = DMCAHandler()
content_moderator = ContentModerator()
input_validator = InputValidator()