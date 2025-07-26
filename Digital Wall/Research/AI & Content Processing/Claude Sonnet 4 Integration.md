# [[Claude Sonnet 4 Integration]] - AI Content Processing

## Overview & Core Concepts

**Claude Sonnet 4** serves as the intelligent core of the [[Digital Wall]] project, providing advanced content analysis, categorization, and understanding capabilities. This document covers comprehensive integration patterns, prompt engineering strategies, and production optimization for AI-powered content curation.

### Key AI Capabilities for Digital Wall
- **[[Content Understanding]]**: Deep semantic analysis of shared content
- **[[Metadata Extraction]]**: Intelligent title, description, and tag generation  
- **[[Sentiment Analysis]]**: Emotional context and tone assessment
- **[[Topic Modeling]]**: Key theme identification and categorization
- **[[Quality Scoring]]**: Content quality and relevance assessment

## Technical Deep Dive

### Anthropic Client Configuration

```python
# app/core/ai_client.py - Claude Sonnet 4 client setup
import asyncio
import logging
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timedelta
from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field
import json

from app.core.config import settings
from app.core.cache import get_redis_client
from app.utils.rate_limiting import RateLimiter

logger = logging.getLogger(__name__)

class ContentAnalysisRequest(BaseModel):
    content_type: str = Field(..., description="Type of content: url, text, image, video")
    primary_content: str = Field(..., description="Main content to analyze")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context")
    user_preferences: Optional[Dict[str, str]] = Field(default=None, description="User taste preferences")
    analysis_depth: str = Field(default="standard", description="Analysis depth: quick, standard, deep")

class ContentAnalysisResult(BaseModel):
    title: str = Field(..., description="Generated or enhanced title")
    description: str = Field(..., description="Content summary")
    tags: List[str] = Field(..., description="Relevant tags")
    category: str = Field(..., description="Primary category")
    sentiment: str = Field(..., description="Emotional sentiment")
    topics: List[str] = Field(..., description="Key topics identified")
    quality_score: float = Field(..., ge=0.0, le=1.0, description="Content quality score")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Analysis confidence")
    reasoning: str = Field(..., description="AI reasoning for categorization")

class ClaudeSonnet4Client:
    def __init__(self):
        self.client = AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            max_retries=3,
            timeout=30.0
        )
        self.redis = get_redis_client()
        self.rate_limiter = RateLimiter("claude_api", requests=100, window=60)
        
        # Model configuration
        self.model = "claude-3-sonnet-20240229"
        self.max_tokens = 4000
        self.temperature = 0.1  # Low temperature for consistent analysis
        
    async def analyze_content(
        self, 
        request: ContentAnalysisRequest
    ) -> ContentAnalysisResult:
        """Analyze content with Claude Sonnet 4"""
        
        # Check rate limits
        await self.rate_limiter.acquire()
        
        try:
            # Check cache first
            cache_key = self._generate_cache_key(request)
            cached_result = await self._get_cached_analysis(cache_key)
            if cached_result:
                logger.info("Returning cached analysis")
                return cached_result
            
            # Build analysis prompt
            prompt = self._build_analysis_prompt(request)
            
            # Make API call to Claude
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                messages=[{
                    "role": "user", 
                    "content": prompt
                }],
                system=self._get_system_prompt()
            )
            
            # Parse response
            analysis_text = response.content[0].text
            analysis_result = self._parse_claude_response(analysis_text, request)
            
            # Cache the result
            await self._cache_analysis(cache_key, analysis_result)
            
            # Log for monitoring
            logger.info(f"Content analyzed: {request.content_type}, confidence: {analysis_result.confidence}")
            
            return analysis_result
            
        except Exception as e:
            logger.error(f"Claude analysis error: {e}")
            # Return fallback analysis
            return self._generate_fallback_analysis(request)
    
    def _build_analysis_prompt(self, request: ContentAnalysisRequest) -> str:
        """Build structured prompt for content analysis"""
        
        # Base prompt structure
        prompt_parts = [
            "Analyze the following content for a personal content curation platform called Digital Wall.",
            f"Content Type: {request.content_type}",
            f"Content: {request.primary_content}"
        ]
        
        # Add context if available
        if request.context:
            prompt_parts.append(f"Additional Context: {json.dumps(request.context)}")
        
        # Add user preferences for personalized analysis
        if request.user_preferences:
            prompt_parts.append(f"User Preferences: {json.dumps(request.user_preferences)}")
        
        # Analysis instructions based on depth
        analysis_instructions = self._get_analysis_instructions(request.analysis_depth)
        prompt_parts.append(analysis_instructions)
        
        # Output format specification
        prompt_parts.append("""
Please provide your analysis in the following JSON format:
{
  "title": "Enhanced or extracted title (max 100 chars)",
  "description": "Concise summary of content (max 300 chars)",
  "tags": ["relevant", "tags", "here"],
  "category": "technology|entertainment|news|social|education|lifestyle|business|art|science|other",
  "sentiment": "positive|negative|neutral|mixed",
  "topics": ["main", "topics", "identified"],
  "quality_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of categorization reasoning"
}

Focus on accuracy, relevance, and usefulness for personal content curation.
        """)
        
        return "\n\n".join(prompt_parts)
    
    def _get_system_prompt(self) -> str:
        """Get system prompt for Claude"""
        return """
You are an expert content analyst for a personal digital curation platform. Your role is to help users understand, organize, and discover their shared content.

Key principles:
1. Accuracy: Provide precise, factual analysis
2. Relevance: Focus on what matters for personal curation
3. Consistency: Use consistent categorization schemes
4. Personalization: Consider user preferences when available
5. Quality: Assess content value and relevance

Content categories explained:
- technology: Programming, AI, gadgets, software, tech news
- entertainment: Movies, TV, games, music, celebrities
- news: Current events, politics, world news
- social: Social media content, relationships, community
- education: Learning resources, tutorials, courses
- lifestyle: Health, fitness, food, travel, personal development
- business: Entrepreneurship, finance, marketing, career
- art: Visual art, design, creative content
- science: Research, discoveries, academic content
- other: Content that doesn't fit other categories

Be concise but thorough in your analysis.
        """
    
    def _get_analysis_instructions(self, depth: str) -> str:
        """Get analysis instructions based on depth level"""
        
        if depth == "quick":
            return """
Perform a quick analysis focusing on:
- Basic categorization
- Simple sentiment assessment
- Essential tags (3-5)
- Brief description
            """
        elif depth == "deep":
            return """
Perform a comprehensive deep analysis including:
- Detailed content examination
- Nuanced sentiment and emotional analysis
- Rich topic modeling and theme identification
- Quality assessment and relevance scoring
- Cultural and contextual considerations
- Relationship to user's broader interests
            """
        else:  # standard
            return """
Perform standard analysis including:
- Accurate categorization and tagging
- Sentiment analysis
- Key topic identification
- Quality scoring
- Clear, useful description
            """
    
    def _parse_claude_response(
        self, 
        response_text: str, 
        request: ContentAnalysisRequest
    ) -> ContentAnalysisResult:
        """Parse Claude's response into structured result"""
        
        try:
            # Extract JSON from response
            import re
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                analysis_data = json.loads(json_match.group())
            else:
                raise ValueError("No JSON found in response")
            
            # Validate and clean data
            analysis_data = self._validate_analysis_data(analysis_data)
            
            return ContentAnalysisResult(**analysis_data)
            
        except Exception as e:
            logger.error(f"Failed to parse Claude response: {e}")
            logger.debug(f"Response text: {response_text}")
            
            # Generate structured fallback from raw response
            return self._extract_from_raw_response(response_text, request)
    
    def _validate_analysis_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and clean analysis data"""
        
        # Ensure required fields
        required_fields = ['title', 'description', 'tags', 'category', 'sentiment', 'topics']
        for field in required_fields:
            if field not in data:
                data[field] = self._get_default_value(field)
        
        # Validate and limit field lengths
        data['title'] = str(data['title'])[:100]
        data['description'] = str(data['description'])[:300]
        
        # Ensure tags is a list
        if not isinstance(data['tags'], list):
            data['tags'] = [str(data['tags'])]
        data['tags'] = [str(tag).lower().strip() for tag in data['tags'][:10]]
        
        # Validate category
        valid_categories = [
            'technology', 'entertainment', 'news', 'social', 'education',
            'lifestyle', 'business', 'art', 'science', 'other'
        ]
        if data['category'] not in valid_categories:
            data['category'] = 'other'
        
        # Validate sentiment
        valid_sentiments = ['positive', 'negative', 'neutral', 'mixed']
        if data['sentiment'] not in valid_sentiments:
            data['sentiment'] = 'neutral'
        
        # Ensure topics is a list
        if not isinstance(data['topics'], list):
            data['topics'] = [str(data['topics'])]
        data['topics'] = [str(topic).strip() for topic in data['topics'][:8]]
        
        # Validate scores
        data['quality_score'] = max(0.0, min(1.0, float(data.get('quality_score', 0.5))))
        data['confidence'] = max(0.0, min(1.0, float(data.get('confidence', 0.7))))
        
        # Ensure reasoning exists
        data['reasoning'] = str(data.get('reasoning', 'Standard content analysis performed'))[:200]
        
        return data
    
    async def batch_analyze(
        self, 
        requests: List[ContentAnalysisRequest],
        max_concurrent: int = 5
    ) -> List[ContentAnalysisResult]:
        """Batch analyze multiple content items with concurrency control"""
        
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def analyze_single(request: ContentAnalysisRequest) -> ContentAnalysisResult:
            async with semaphore:
                try:
                    return await self.analyze_content(request)
                except Exception as e:
                    logger.error(f"Batch analysis error: {e}")
                    return self._generate_fallback_analysis(request)
        
        # Execute batch with progress tracking
        tasks = [analyze_single(req) for req in requests]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Batch item {i} failed: {result}")
                processed_results.append(self._generate_fallback_analysis(requests[i]))
            else:
                processed_results.append(result)
        
        return processed_results
    
    def _generate_cache_key(self, request: ContentAnalysisRequest) -> str:
        """Generate cache key for analysis request"""
        import hashlib
        
        # Create hash of request content
        content_hash = hashlib.md5(
            f"{request.content_type}:{request.primary_content}:{request.analysis_depth}".encode()
        ).hexdigest()
        
        return f"claude_analysis:{content_hash}"
    
    async def _get_cached_analysis(self, cache_key: str) -> Optional[ContentAnalysisResult]:
        """Get cached analysis result"""
        try:
            cached_data = await self.redis.get(cache_key)
            if cached_data:
                data = json.loads(cached_data)
                return ContentAnalysisResult(**data)
        except Exception as e:
            logger.warning(f"Cache retrieval error: {e}")
        
        return None
    
    async def _cache_analysis(
        self, 
        cache_key: str, 
        result: ContentAnalysisResult,
        ttl: int = 86400  # 24 hours
    ):
        """Cache analysis result"""
        try:
            await self.redis.setex(
                cache_key, 
                ttl, 
                result.model_dump_json()
            )
        except Exception as e:
            logger.warning(f"Cache storage error: {e}")
```

### Advanced Prompt Engineering

```python
# app/services/prompt_engineering.py - Advanced prompt strategies
from typing import Dict, Any, List
from enum import Enum

class PromptTemplate(Enum):
    CONTENT_ANALYSIS = "content_analysis"
    TREND_DETECTION = "trend_detection"
    PERSONALIZATION = "personalization"
    QUALITY_ASSESSMENT = "quality_assessment"

class AdvancedPromptEngine:
    def __init__(self):
        self.templates = {
            PromptTemplate.CONTENT_ANALYSIS: self._content_analysis_template,
            PromptTemplate.TREND_DETECTION: self._trend_detection_template,
            PromptTemplate.PERSONALIZATION: self._personalization_template,
            PromptTemplate.QUALITY_ASSESSMENT: self._quality_assessment_template
        }
    
    def build_prompt(
        self, 
        template: PromptTemplate, 
        context: Dict[str, Any]
    ) -> str:
        """Build optimized prompt using template and context"""
        template_func = self.templates.get(template)
        if not template_func:
            raise ValueError(f"Unknown template: {template}")
        
        return template_func(context)
    
    def _content_analysis_template(self, context: Dict[str, Any]) -> str:
        """Template for comprehensive content analysis"""
        
        content_type = context.get('content_type', 'unknown')
        content = context.get('content', '')
        user_history = context.get('user_history', [])
        
        prompt = f"""
As an expert content analyst for Digital Wall, analyze this {content_type} content for personal curation:

CONTENT TO ANALYZE:
{content}

ANALYSIS FRAMEWORK:
1. UNDERSTANDING: What is this content about? What's the main message or value?
2. CATEGORIZATION: Which category best fits this content?
3. QUALITY: How valuable/interesting is this content? (0.0-1.0 scale)
4. SENTIMENT: What's the emotional tone?
5. TOPICS: What are the 3-5 key topics/themes?
6. TAGS: Generate 5-8 relevant, searchable tags
7. TITLE: Create or improve the title (engaging, descriptive, max 100 chars)
8. DESCRIPTION: Write a compelling summary (max 300 chars)

PERSONALIZATION CONTEXT:
"""
        
        if user_history:
            recent_interests = [item.get('category', 'unknown') for item in user_history[-10:]]
            interest_summary = ', '.join(set(recent_interests))
            prompt += f"User's recent interests: {interest_summary}\n"
        
        prompt += """
OUTPUT FORMAT:
Provide analysis as valid JSON with these exact fields:
{
  "title": "string",
  "description": "string", 
  "tags": ["array", "of", "strings"],
  "category": "string",
  "sentiment": "positive|negative|neutral|mixed",
  "topics": ["array", "of", "topics"],
  "quality_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Be precise, relevant, and useful for personal content curation.
        """
        
        return prompt
    
    def _trend_detection_template(self, context: Dict[str, Any]) -> str:
        """Template for trend detection and analysis"""
        
        content_items = context.get('content_items', [])
        time_window = context.get('time_window', '7 days')
        
        prompt = f"""
Analyze these {len(content_items)} content items from the last {time_window} to identify trends:

CONTENT ITEMS:
"""
        
        for i, item in enumerate(content_items[:20], 1):  # Limit to 20 items
            prompt += f"{i}. {item.get('title', 'No title')} - {item.get('category', 'uncategorized')}\n"
        
        prompt += """
TREND ANALYSIS TASKS:
1. Identify emerging topics and themes
2. Detect sentiment patterns
3. Spot category distributions
4. Find connections between items
5. Predict potential interest areas

OUTPUT FORMAT:
{
  "emerging_topics": ["topic1", "topic2"],
  "sentiment_trend": "positive|negative|neutral|mixed",
  "popular_categories": ["category1", "category2"],
  "connections": ["relationship1", "relationship2"],
  "predictions": ["future_interest1", "future_interest2"],
  "confidence": 0.0-1.0,
  "summary": "Brief trend summary"
}
        """
        
        return prompt
    
    def _personalization_template(self, context: Dict[str, Any]) -> str:
        """Template for personalized content recommendations"""
        
        user_profile = context.get('user_profile', {})
        candidate_content = context.get('candidate_content', [])
        
        prompt = f"""
Personalize content recommendations based on user profile:

USER PROFILE:
- Preferred categories: {user_profile.get('preferred_categories', [])}
- Recent activity: {user_profile.get('recent_activity', [])}
- Engagement patterns: {user_profile.get('engagement_patterns', {})}
- Interests: {user_profile.get('interests', [])}

CANDIDATE CONTENT:
"""
        
        for i, content in enumerate(candidate_content[:10], 1):
            prompt += f"{i}. {content.get('title', 'No title')} - {content.get('description', '')}\n"
        
        prompt += """
PERSONALIZATION TASKS:
1. Score each content item's relevance (0.0-1.0)
2. Explain why it matches user interests
3. Identify potential new interest areas
4. Suggest optimal presentation order

OUTPUT FORMAT:
{
  "scored_content": [
    {
      "index": 1,
      "relevance_score": 0.0-1.0,
      "reasoning": "why relevant",
      "new_interest_potential": 0.0-1.0
    }
  ],
  "recommended_order": [1, 3, 2, ...],
  "emerging_interests": ["potential", "new", "interests"],
  "engagement_prediction": 0.0-1.0
}
        """
        
        return prompt

# Usage example in content processing
async def analyze_with_advanced_prompts(
    content_data: Dict[str, Any], 
    user_context: Optional[Dict[str, Any]] = None
) -> ContentAnalysisResult:
    """Analyze content using advanced prompt engineering"""
    
    prompt_engine = AdvancedPromptEngine()
    claude_client = ClaudeSonnet4Client()
    
    # Build context for prompt
    analysis_context = {
        'content_type': content_data.get('type', 'unknown'),
        'content': content_data.get('text', content_data.get('url', '')),
        'user_history': user_context.get('recent_items', []) if user_context else []
    }
    
    # Generate optimized prompt
    prompt = prompt_engine.build_prompt(
        PromptTemplate.CONTENT_ANALYSIS, 
        analysis_context
    )
    
    # Create analysis request
    request = ContentAnalysisRequest(
        content_type=analysis_context['content_type'],
        primary_content=analysis_context['content'],
        context=analysis_context,
        analysis_depth="deep"
    )
    
    return await claude_client.analyze_content(request)
```

## Development Patterns

### Cost Optimization and Token Management

```python
# app/utils/ai_cost_optimizer.py - AI cost management
import asyncio
from typing import Dict, Any, List
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class AIUsageTracker:
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def track_api_usage(
        self,
        user_id: str,
        tokens_used: int,
        operation_type: str,
        cost_cents: float
    ):
        """Track AI API usage for cost monitoring"""
        
        # Daily usage tracking
        today = datetime.now().strftime('%Y-%m-%d')
        daily_key = f"ai_usage:daily:{today}"
        user_daily_key = f"ai_usage:user:{user_id}:{today}"
        
        # Increment counters
        pipe = self.redis.pipeline()
        pipe.hincrby(daily_key, 'total_tokens', tokens_used)
        pipe.hincrby(daily_key, 'total_requests', 1)
        pipe.hincrbyfloat(daily_key, 'total_cost_cents', cost_cents)
        
        pipe.hincrby(user_daily_key, 'tokens', tokens_used)
        pipe.hincrby(user_daily_key, 'requests', 1)
        pipe.hincrbyfloat(user_daily_key, 'cost_cents', cost_cents)
        
        # Set expiration for cleanup
        pipe.expire(daily_key, 2592000)  # 30 days
        pipe.expire(user_daily_key, 2592000)  # 30 days
        
        await pipe.execute()
    
    async def check_user_quota(self, user_id: str) -> Dict[str, Any]:
        """Check user's AI usage quota"""
        
        today = datetime.now().strftime('%Y-%m-%d')
        user_daily_key = f"ai_usage:user:{user_id}:{today}"
        
        usage_data = await self.redis.hgetall(user_daily_key)
        
        daily_tokens = int(usage_data.get(b'tokens', 0))
        daily_requests = int(usage_data.get(b'requests', 0))
        daily_cost = float(usage_data.get(b'cost_cents', 0))
        
        # Define quotas (these could come from user subscription tier)
        quotas = {
            'daily_tokens_limit': 100000,  # ~$15 worth
            'daily_requests_limit': 100,
            'daily_cost_limit_cents': 1500  # $15
        }
        
        return {
            'usage': {
                'daily_tokens': daily_tokens,
                'daily_requests': daily_requests,
                'daily_cost_cents': daily_cost
            },
            'limits': quotas,
            'remaining': {
                'tokens': max(0, quotas['daily_tokens_limit'] - daily_tokens),
                'requests': max(0, quotas['daily_requests_limit'] - daily_requests),
                'cost_cents': max(0, quotas['daily_cost_limit_cents'] - daily_cost)
            },
            'quota_exceeded': (
                daily_tokens >= quotas['daily_tokens_limit'] or
                daily_requests >= quotas['daily_requests_limit'] or
                daily_cost >= quotas['daily_cost_limit_cents']
            )
        }

class SmartContentPrioritizer:
    """Prioritize content for AI analysis based on importance and cost"""
    
    def __init__(self, usage_tracker: AIUsageTracker):
        self.usage_tracker = usage_tracker
    
    async def prioritize_batch(
        self,
        content_items: List[Dict[str, Any]],
        user_id: str
    ) -> List[Dict[str, Any]]:
        """Prioritize content items for analysis based on various factors"""
        
        # Check user quota
        quota_info = await self.usage_tracker.check_user_quota(user_id)
        remaining_requests = quota_info['remaining']['requests']
        
        # If quota is low, be more selective
        if remaining_requests < len(content_items):
            content_items = await self._filter_high_priority(
                content_items, 
                remaining_requests
            )
        
        # Sort by priority score
        prioritized_items = []
        for item in content_items:
            priority_score = await self._calculate_priority_score(item, user_id)
            prioritized_items.append({
                **item,
                'priority_score': priority_score
            })
        
        # Sort by priority score (descending)
        prioritized_items.sort(key=lambda x: x['priority_score'], reverse=True)
        
        return prioritized_items
    
    async def _calculate_priority_score(
        self,
        content_item: Dict[str, Any],
        user_id: str
    ) -> float:
        """Calculate priority score for content item"""
        
        score = 0.0
        
        # Recent content gets higher priority
        if content_item.get('timestamp'):
            age_hours = (datetime.now() - content_item['timestamp']).total_seconds() / 3600
            recency_score = max(0, 1 - (age_hours / 24))  # Decay over 24 hours
            score += recency_score * 0.3
        
        # Content from active sharing gets higher priority
        if content_item.get('share_method') == 'native_share':
            score += 0.4  # Native sharing indicates high intent
        
        # Larger content (likely more important) gets higher priority
        content_length = len(content_item.get('text', content_item.get('url', '')))
        length_score = min(1.0, content_length / 1000)  # Normalize to 1000 chars
        score += length_score * 0.2
        
        # User's historical engagement with similar content
        category = content_item.get('category', 'unknown')
        if category != 'unknown':
            # This would query user's historical engagement with this category
            engagement_score = 0.5  # Placeholder
            score += engagement_score * 0.1
        
        return min(1.0, score)
    
    async def _filter_high_priority(
        self,
        content_items: List[Dict[str, Any]],
        max_items: int
    ) -> List[Dict[str, Any]]:
        """Filter to high-priority items only"""
        
        # Quick scoring for filtering
        scored_items = []
        for item in content_items:
            quick_score = 0.0
            
            # Prioritize recent native shares
            if item.get('share_method') == 'native_share':
                quick_score += 0.8
            
            # Prioritize URLs over plain text
            if item.get('url'):
                quick_score += 0.3
            
            # Prioritize longer content
            content_length = len(item.get('text', item.get('url', '')))
            if content_length > 100:
                quick_score += 0.2
            
            scored_items.append((quick_score, item))
        
        # Sort and take top items
        scored_items.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored_items[:max_items]]
```

## Production Considerations

### Error Handling and Fallbacks

```python
# app/services/ai_fallback.py - Robust error handling for AI services
from typing import Optional, Dict, Any
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class AIFallbackService:
    """Provide intelligent fallbacks when Claude API is unavailable"""
    
    def __init__(self):
        self.fallback_strategies = [
            self._rule_based_analysis,
            self._heuristic_analysis,
            self._minimal_analysis
        ]
    
    async def analyze_with_fallback(
        self,
        content_request: ContentAnalysisRequest,
        claude_client: ClaudeSonnet4Client
    ) -> ContentAnalysisResult:
        """Attempt Claude analysis with intelligent fallbacks"""
        
        # Try Claude first
        try:
            return await claude_client.analyze_content(content_request)
            
        except Exception as claude_error:
            logger.warning(f"Claude API failed: {claude_error}")
            
            # Try fallback strategies in order
            for i, fallback_strategy in enumerate(self.fallback_strategies):
                try:
                    logger.info(f"Attempting fallback strategy {i+1}")
                    result = await fallback_strategy(content_request)
                    
                    # Mark as fallback result
                    result.reasoning = f"Fallback analysis (strategy {i+1}): {result.reasoning}"
                    result.confidence *= 0.7  # Reduce confidence for fallback
                    
                    return result
                    
                except Exception as fallback_error:
                    logger.error(f"Fallback strategy {i+1} failed: {fallback_error}")
                    continue
            
            # If all fallbacks fail, return minimal analysis
            logger.error("All analysis strategies failed, returning minimal result")
            return self._emergency_fallback(content_request)
    
    async def _rule_based_analysis(
        self, 
        request: ContentAnalysisRequest
    ) -> ContentAnalysisResult:
        """Rule-based content analysis fallback"""
        
        content = request.primary_content.lower()
        
        # Category detection using keywords
        category_keywords = {
            'technology': ['code', 'programming', 'software', 'ai', 'tech', 'app', 'api'],
            'news': ['breaking', 'report', 'announces', 'today', 'latest'],
            'entertainment': ['movie', 'music', 'game', 'show', 'video', 'funny'],
            'business': ['company', 'startup', 'market', 'business', 'revenue', 'profit'],
            'education': ['learn', 'tutorial', 'guide', 'course', 'education', 'study'],
            'science': ['research', 'study', 'discovery', 'experiment', 'data', 'analysis']
        }
        
        category = 'other'
        max_score = 0
        
        for cat, keywords in category_keywords.items():
            score = sum(1 for keyword in keywords if keyword in content)
            if score > max_score:
                max_score = score
                category = cat
        
        # Sentiment analysis using simple word matching
        positive_words = ['good', 'great', 'amazing', 'excellent', 'love', 'awesome']
        negative_words = ['bad', 'terrible', 'hate', 'awful', 'worst', 'sucks']
        
        positive_count = sum(1 for word in positive_words if word in content)
        negative_count = sum(1 for word in negative_words if word in content)
        
        if positive_count > negative_count:
            sentiment = 'positive'
        elif negative_count > positive_count:
            sentiment = 'negative'
        else:
            sentiment = 'neutral'
        
        # Extract potential tags from content
        import re
        words = re.findall(r'\b\w+\b', content.lower())
        common_words = {'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from'}
        potential_tags = [word for word in words if len(word) > 3 and word not in common_words]
        tags = list(set(potential_tags[:8]))  # Take unique tags, limit to 8
        
        # Generate title and description
        title = request.context.get('title', '') if request.context else ''
        if not title and request.content_type == 'url':
            title = 'Shared Link'
        elif not title:
            title = content[:50] + '...' if len(content) > 50 else content
        
        description = content[:200] + '...' if len(content) > 200 else content
        
        return ContentAnalysisResult(
            title=title,
            description=description,
            tags=tags,
            category=category,
            sentiment=sentiment,
            topics=tags[:5],  # Use top tags as topics
            quality_score=0.5,  # Neutral quality score
            confidence=0.6,     # Moderate confidence
            reasoning="Rule-based analysis using keyword matching and heuristics"
        )
    
    async def _heuristic_analysis(
        self,
        request: ContentAnalysisRequest
    ) -> ContentAnalysisResult:
        """Heuristic-based analysis using content patterns"""
        
        content = request.primary_content
        
        # URL-specific heuristics
        if request.content_type == 'url':
            from urllib.parse import urlparse
            parsed_url = urlparse(content)
            domain = parsed_url.netloc.lower()
            
            # Domain-based categorization
            domain_categories = {
                'github.com': 'technology',
                'stackoverflow.com': 'technology',
                'medium.com': 'business',
                'youtube.com': 'entertainment',
                'netflix.com': 'entertainment',
                'news.ycombinator.com': 'technology',
                'reddit.com': 'social',
                'twitter.com': 'social',
                'linkedin.com': 'business'
            }
            
            category = domain_categories.get(domain, 'other')
            
            # Use domain as primary topic
            topics = [domain.replace('.com', '').replace('.', '_')]
            tags = [domain.split('.')[0], request.content_type]
            
            return ContentAnalysisResult(
                title=f"Link from {domain}",
                description=f"Shared content from {domain}",
                tags=tags,
                category=category,
                sentiment='neutral',
                topics=topics,
                quality_score=0.6,
                confidence=0.5,
                reasoning=f"Heuristic analysis based on domain: {domain}"
            )
        
        # Text content heuristics
        else:
            # Length-based quality scoring
            content_length = len(content)
            if content_length < 50:
                quality_score = 0.3
            elif content_length < 200:
                quality_score = 0.6
            else:
                quality_score = 0.8
            
            # Extract key phrases (simplified)
            sentences = content.split('.')[:3]  # First 3 sentences
            topics = [sentence.strip()[:30] for sentence in sentences if sentence.strip()]
            
            return ContentAnalysisResult(
                title=content[:60] + '...' if len(content) > 60 else content,
                description=content[:150] + '...' if len(content) > 150 else content,
                tags=['shared', 'text', 'content'],
                category='other',
                sentiment='neutral',
                topics=topics,
                quality_score=quality_score,
                confidence=0.4,
                reasoning="Heuristic analysis based on content patterns"
            )
    
    def _emergency_fallback(
        self,
        request: ContentAnalysisRequest
    ) -> ContentAnalysisResult:
        """Emergency fallback when all other methods fail"""
        
        return ContentAnalysisResult(
            title='Shared Content',
            description='Content shared to Digital Wall',
            tags=['shared'],
            category='other',
            sentiment='neutral',
            topics=['content'],
            quality_score=0.3,
            confidence=0.2,
            reasoning="Emergency fallback - minimal analysis applied"
        )
```

## Integration Examples

### Complete AI Processing Architecture

```mermaid
graph TD
    A[Content Input] --> B[Preprocessing]
    B --> C[Claude Sonnet 4 API]
    C --> D{API Success?}
    
    D -->|Yes| E[Parse Response]
    D -->|No| F[Fallback Strategy]
    
    E --> G[Validate Results]
    F --> H[Rule-based Analysis]
    F --> I[Heuristic Analysis]
    F --> J[Emergency Fallback]
    
    G --> K[Cache Results]
    H --> K
    I --> K
    J --> K
    
    K --> L[[[Content Processing Pipeline]]]
    
    subgraph "Cost Management"
        M[Usage Tracking]
        N[Quota Checking]
        O[Prioritization]
    end
    
    C --> M
    M --> N
    N --> O
    O --> C
    
    subgraph "Quality Assurance"
        P[Response Validation]
        Q[Confidence Scoring]
        R[Fallback Triggering]
    end
    
    E --> P
    P --> Q
    Q --> R
```

### Integration with [[Digital Wall]] Components

- **[[FastAPI Async Architecture]]**: API endpoints for AI processing
- **[[Content Processing Pipeline]]**: Orchestrated AI analysis workflows
- **[[Next.js 14 PWA Patterns]]**: Frontend AI analysis status and results
- **[[Taste Graph Algorithms]]**: AI-generated content understanding feeds into recommendation engine

## References & Further Reading

### Official Documentation
- [Anthropic Claude API](https://docs.anthropic.com/)
- [Claude Sonnet Model Guide](https://docs.anthropic.com/claude/docs/models-overview)
- [Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)

### Best Practices
- [AI Cost Optimization](https://docs.anthropic.com/claude/docs/optimizing-costs)
- [Error Handling Strategies](https://docs.anthropic.com/claude/docs/errors-and-limits)

### Related [[Vault]] Concepts
- [[AI Content Analysis]] - Content understanding techniques
- [[Prompt Engineering]] - AI prompt optimization strategies
- [[Cost Optimization]] - Managing AI service costs
- [[Error Handling]] - Resilient system design patterns
- [[Content Categorization]] - Automated content organization

#digital-wall #research #ai #claude #content-analysis #nlp