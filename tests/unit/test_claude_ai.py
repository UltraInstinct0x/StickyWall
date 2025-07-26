"""
Unit tests for Claude AI service
"""
import pytest
from unittest.mock import AsyncMock, patch
from app.services.claude_ai import claude_ai, ContentAnalysis

@pytest.mark.asyncio
class TestClaudeAIService:
    """Test Claude AI service functionality"""
    
    def test_content_type_detection(self):
        """Test content type detection from URLs"""
        youtube_url = "https://youtube.com/watch?v=123"
        github_url = "https://github.com/user/repo"
        twitter_url = "https://twitter.com/user/status/123"
        
        assert claude_ai._detect_content_type(youtube_url, {}) == "video"
        assert claude_ai._detect_content_type(github_url, {}) == "technical"
        assert claude_ai._detect_content_type(twitter_url, {}) == "social_post"
    
    def test_simple_categorization(self):
        """Test fallback categorization system"""
        tech_content = "This is about programming and software development with AI and machine learning"
        business_content = "This startup raised 10 million in funding for their new business model"
        news_content = "Breaking news: latest report announces major update"
        
        assert claude_ai._simple_categorize("", tech_content, "") == "technology"
        assert claude_ai._simple_categorize("", business_content, "") == "business"
        assert claude_ai._simple_categorize("", news_content, "") == "news"
    
    def test_tag_extraction(self):
        """Test simple tag extraction"""
        url = "https://github.com/user/awesome-project"
        text = "This is about artificial intelligence and machine learning algorithms"
        title = "AI and ML Guide"
        
        tags = claude_ai._extract_simple_tags(url, text, title)
        assert isinstance(tags, list)
        assert len(tags) > 0
        assert "github" in tags or "awesome-project" in tags
    
    def test_fallback_analysis(self):
        """Test fallback analysis when Claude AI is not available"""
        content_data = {
            "url": "https://example.com/article",
            "text": "This is a test article about technology and programming.",
            "title": "Test Article"
        }
        
        analysis = claude_ai._fallback_analysis(content_data)
        
        assert isinstance(analysis, ContentAnalysis)
        assert analysis.title == "Test Article"
        assert analysis.category in ["technology", "other"]
        assert analysis.sentiment == "neutral"
        assert analysis.quality_score == 0.5
        assert len(analysis.summary) > 0
    
    @patch('app.services.claude_ai.claude_ai.client')
    async def test_content_analysis_with_mock(self, mock_client):
        """Test content analysis with mocked Claude client"""
        # Mock Claude response
        mock_response = AsyncMock()
        mock_response.content = [AsyncMock()]
        mock_response.content[0].text = '''
        {
            "title": "AI and Technology",
            "summary": "An article about artificial intelligence",
            "category": "technology",
            "tags": ["AI", "technology", "machine learning"],
            "sentiment": "positive",
            "quality_score": 0.8,
            "topics": ["artificial intelligence", "technology"],
            "content_type": "article",
            "language": "en",
            "reading_time_minutes": 5,
            "key_points": ["AI is transforming industries", "Machine learning is important"]
        }
        '''
        
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        claude_ai.client = mock_client
        
        content_data = {
            "url": "https://example.com/ai-article",
            "text": "This is an article about artificial intelligence and its impact.",
            "title": "AI Revolution"
        }
        
        analysis = await claude_ai.analyze_content(content_data)
        
        assert isinstance(analysis, ContentAnalysis)
        assert analysis.title == "AI and Technology"
        assert analysis.category == "technology"
        assert analysis.sentiment == "positive"
        assert analysis.quality_score == 0.8
    
    def test_prepare_content_for_analysis(self):
        """Test content preparation for analysis"""
        content_data = {
            "title": "Test Title",
            "url": "https://example.com",
            "text": "This is test content",
            "description": "Test description"
        }
        
        prepared = claude_ai._prepare_content_for_analysis(content_data)
        
        assert "Title: Test Title" in prepared
        assert "URL: https://example.com" in prepared
        assert "Content: This is test content" in prepared
        assert "Description: Test description" in prepared
    
    def test_create_analysis_prompt(self):
        """Test analysis prompt creation"""
        content_text = "Test content for analysis"
        content_data = {"url": "https://example.com"}
        
        prompt = claude_ai._create_analysis_prompt(content_text, content_data)
        
        assert "Test content for analysis" in prompt
        assert "JSON" in prompt
        assert "title" in prompt
        assert "category" in prompt
        assert "sentiment" in prompt
    
    @patch('app.services.claude_ai.claude_ai.client')
    async def test_content_enhancement(self, mock_client):
        """Test content enhancement functionality"""
        mock_response = AsyncMock()
        mock_response.content = [AsyncMock()]
        mock_response.content[0].text = "Enhanced and improved content with better clarity."
        
        mock_client.messages.create = AsyncMock(return_value=mock_response)
        claude_ai.client = mock_client
        
        original_content = "This is original content that needs improvement."
        enhanced = await claude_ai.enhance_content(original_content, "improve")
        
        assert enhanced == "Enhanced and improved content with better clarity."
        mock_client.messages.create.assert_called_once()
    
    async def test_rate_limiting(self):
        """Test rate limiting functionality"""
        # This is a basic test - in practice you'd need to mock datetime
        original_timestamps = claude_ai._request_timestamps.copy()
        
        await claude_ai._check_rate_limit()
        
        # Should not raise any errors
        assert True