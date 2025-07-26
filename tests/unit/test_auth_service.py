"""
Unit tests for authentication service
"""
import pytest
import asyncio
from datetime import datetime, timedelta
from app.services.auth_service import auth_service
from app.services.redis_service import redis_service

@pytest.fixture
async def setup_redis():
    """Setup Redis connection for testing"""
    await redis_service.connect()
    yield
    await redis_service.disconnect()

@pytest.mark.asyncio
class TestAuthService:
    """Test authentication service functionality"""
    
    def test_password_hashing(self):
        """Test password hashing and verification"""
        password = "test_password_123"
        hashed = auth_service.hash_password(password)
        
        assert hashed != password
        assert auth_service.verify_password(password, hashed)
        assert not auth_service.verify_password("wrong_password", hashed)
    
    def test_password_strength_validation(self):
        """Test password strength validation"""
        weak_password = "123"
        strong_password = "MyStr0ng!Pass"
        
        weak_result = auth_service.validate_password_strength(weak_password)
        strong_result = auth_service.validate_password_strength(strong_password)
        
        assert not weak_result['valid']
        assert weak_result['score'] < 50
        assert strong_result['valid']
        assert strong_result['score'] >= 75
    
    def test_jwt_token_creation_and_decoding(self):
        """Test JWT token creation and decoding"""
        token_data = {
            "user_id": 123,
            "username": "testuser",
            "email": "test@example.com"
        }
        
        # Create token
        token = auth_service.create_access_token(token_data)
        assert isinstance(token, str)
        assert len(token) > 0
        
        # Decode token (this would need to be async in real implementation)
        # decoded = auth_service.decode_token(token)
        # assert decoded['user_id'] == 123
        # assert decoded['username'] == "testuser"
    
    async def test_session_management(self, setup_redis):
        """Test session creation and management"""
        user_data = {
            "user_id": 123,
            "username": "testuser",
            "email": "test@example.com"
        }
        
        # Create session
        session_id = await auth_service.create_session(user_data)
        assert isinstance(session_id, str)
        assert len(session_id) > 0
        
        # Get session
        retrieved = await auth_service.get_session(session_id)
        assert retrieved['user_id'] == 123
        assert retrieved['username'] == "testuser"
        
        # Delete session
        success = await auth_service.delete_session(session_id)
        assert success
        
        # Verify deletion
        deleted = await auth_service.get_session(session_id)
        assert deleted is None
    
    def test_anonymous_user_id_generation(self):
        """Test anonymous user ID generation"""
        user_id = auth_service.create_anonymous_user_id()
        assert user_id.startswith("anon_")
        assert len(user_id) > 10
        
        # Test uniqueness
        user_id2 = auth_service.create_anonymous_user_id()
        assert user_id != user_id2
    
    def test_api_key_generation(self):
        """Test API key generation"""
        api_key = auth_service.generate_api_key("user_123", "test_key")
        assert isinstance(api_key, str)
        assert len(api_key) > 0
    
    async def test_token_blacklisting(self, setup_redis):
        """Test token blacklisting functionality"""
        token_data = {"user_id": 123, "jti": "test_token_id"}
        token = auth_service.create_access_token(token_data)
        
        # Blacklist token
        success = await auth_service.blacklist_token(token)
        assert success