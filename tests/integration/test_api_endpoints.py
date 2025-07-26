"""
Integration tests for API endpoints
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, get_db
from main import app

# Test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture
def client():
    """Create test client"""
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)

class TestHealthEndpoints:
    """Test health check endpoints"""
    
    def test_health_check(self, client):
        """Test basic health check"""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "uptime_seconds" in data
        assert "timestamp" in data

class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    def test_user_registration(self, client):
        """Test user registration"""
        user_data = {
            "username": "testuser",
            "email": "test@example.com",
            "password": "StrongPassword123!",
            "full_name": "Test User"
        }
        
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["user"]["username"] == "testuser"
        assert data["user"]["email"] == "test@example.com"
        assert "access_token" in data
        assert "refresh_token" in data
    
    def test_user_registration_weak_password(self, client):
        """Test registration with weak password"""
        user_data = {
            "username": "testuser2",
            "email": "test2@example.com",
            "password": "weak",
        }
        
        response = client.post("/api/auth/register", json=user_data)
        assert response.status_code == 400
        
        data = response.json()
        assert "Password is too weak" in data["detail"]["message"]
    
    def test_user_login(self, client):
        """Test user login"""
        # First register a user
        user_data = {
            "username": "loginuser",
            "email": "login@example.com",
            "password": "StrongPassword123!",
        }
        client.post("/api/auth/register", json=user_data)
        
        # Then login
        login_data = {
            "username": "loginuser",
            "password": "StrongPassword123!"
        }
        
        response = client.post("/api/auth/login", json=login_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["user"]["username"] == "loginuser"
        assert "access_token" in data
    
    def test_user_login_invalid_credentials(self, client):
        """Test login with invalid credentials"""
        login_data = {
            "username": "nonexistent",
            "password": "wrongpassword"
        }
        
        response = client.post("/api/auth/login", json=login_data)
        assert response.status_code == 401
        assert "Invalid credentials" in response.json()["detail"]
    
    def test_password_validation(self, client):
        """Test password validation endpoint"""
        response = client.post("/api/auth/validate-password", data={"password": "weak"})
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["validation"]["valid"] is False
        assert data["validation"]["score"] < 50
        
        # Test strong password
        response = client.post("/api/auth/validate-password", data={"password": "StrongPassword123!"})
        assert response.status_code == 200
        
        data = response.json()
        assert data["validation"]["valid"] is True
        assert data["validation"]["score"] > 75

class TestShareEndpoints:
    """Test share functionality endpoints"""
    
    def test_share_endpoint_anonymous(self, client):
        """Test sharing content as anonymous user"""
        share_data = {
            "title": "Test Share",
            "text": "This is a test share",
            "url": "https://example.com"
        }
        
        response = client.post("/api/share", data=share_data)
        
        # Should redirect (303) or return success
        assert response.status_code in [200, 303]
    
    def test_share_endpoint_missing_data(self, client):
        """Test share endpoint with missing data"""
        response = client.post("/api/share", data={})
        
        # Should handle missing data gracefully
        assert response.status_code in [200, 400, 303]

class TestWallsEndpoints:
    """Test walls endpoints"""
    
    def test_get_walls_anonymous(self, client):
        """Test getting walls for anonymous user"""
        response = client.get("/api/walls")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_specific_wall(self, client):
        """Test getting a specific wall"""
        # This would need a wall to exist first
        response = client.get("/api/walls/999")
        # Should return 404 for non-existent wall
        assert response.status_code == 404

class TestEnhancedEndpoints:
    """Test enhanced API endpoints"""
    
    def test_analyze_endpoint(self, client):
        """Test content analysis endpoint"""
        analysis_data = {
            "url": "https://example.com",
            "text": "This is test content for analysis",
            "title": "Test Content"
        }
        
        response = client.post("/api/v2/analyze", data=analysis_data)
        
        # Should return success or queue for processing
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
    
    def test_queue_stats_endpoint(self, client):
        """Test queue statistics endpoint"""
        response = client.get("/api/v2/queue/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "stats" in data
    
    def test_cache_stats_endpoint(self, client):
        """Test cache statistics endpoint"""
        response = client.get("/api/v2/cache/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "cache_health" in data
    
    def test_ai_health_endpoint(self, client):
        """Test AI health check endpoint"""
        response = client.get("/api/v2/ai/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "ai_health" in data
        assert "features" in data["ai_health"]

class TestRootEndpoint:
    """Test root endpoint"""
    
    def test_root_endpoint(self, client):
        """Test root endpoint returns system info"""
        response = client.get("/")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert "status" in data
        assert data["status"] == "running"
        assert "features" in data
        assert "endpoints" in data
        assert "version" in data