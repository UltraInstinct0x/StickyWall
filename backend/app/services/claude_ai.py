"""
Claude AI Integration Service
Handles content analysis, enhancement, and categorization using Anthropic Claude
"""
import os
import asyncio
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
import httpx
from anthropic import AsyncAnthropic
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class ContentAnalysis(BaseModel):
    """Content analysis result from Claude AI"""
    title: Optional[str] = None
    summary: str
    category: str
    tags: List[str] = []
    sentiment: str  # positive, negative, neutral
    quality_score: float  # 0.0 to 1.0
    topics: List[str] = []
    content_type: str  # article, video, image, social_post, etc.
    language: str = "en"
    reading_time_minutes: Optional[int] = None
    key_points: List[str] = []

class ClaudeAIService:
    """
    Claude AI service for content analysis and enhancement
    """
    
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.model = "claude-3-5-sonnet-20241022"
        
        # Rate limiting
        self.rate_limit_requests_per_minute = 60
        self.rate_limit_tokens_per_minute = 100000
        self._request_timestamps = []
        
        if not self.api_key:
            logger.warning("Anthropic API key not configured, AI features will be disabled")
            self.client = None
            return
            
        self.client = AsyncAnthropic(api_key=self.api_key)
    
    async def _check_rate_limit(self):
        """Simple rate limiting check"""
        now = datetime.utcnow()
        # Remove timestamps older than 1 minute
        self._request_timestamps = [
            ts for ts in self._request_timestamps 
            if (now - ts).total_seconds() < 60
        ]
        
        if len(self._request_timestamps) >= self.rate_limit_requests_per_minute:
            logger.warning("Rate limit reached, waiting...")
            await asyncio.sleep(1)
    
    async def analyze_content(self, content_data: Dict[str, Any]) -> Optional[ContentAnalysis]:
        """
        Analyze shared content using Claude AI
        
        Args:
            content_data: Dict containing url, text, title, and other content info
            
        Returns:
            ContentAnalysis object or None if analysis fails
        """
        if not self.client:
            return self._fallback_analysis(content_data)
        
        try:
            await self._check_rate_limit()
            
            # Prepare content for analysis
            analysis_text = self._prepare_content_for_analysis(content_data)
            if not analysis_text:
                return self._fallback_analysis(content_data)
            
            # Create analysis prompt
            prompt = self._create_analysis_prompt(analysis_text, content_data)
            
            # Call Claude API
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=1000,
                temperature=0.3,
                messages=[{
                    "role": "user", 
                    "content": prompt
                }]
            )
            
            # Track request timestamp
            self._request_timestamps.append(datetime.utcnow())
            
            # Parse response
            analysis_result = self._parse_claude_response(response.content[0].text)
            
            logger.info(f"Successfully analyzed content: {content_data.get('url', 'N/A')}")
            return analysis_result
            
        except Exception as e:
            logger.error(f"Claude AI analysis failed: {e}")
            return self._fallback_analysis(content_data)
    
    def _prepare_content_for_analysis(self, content_data: Dict[str, Any]) -> str:
        """Prepare content text for Claude analysis"""
        parts = []
        
        if content_data.get('title'):
            parts.append(f"Title: {content_data['title']}")
        
        if content_data.get('url'):
            parts.append(f"URL: {content_data['url']}")
            
        if content_data.get('text'):
            # Truncate text to avoid token limits
            text = content_data['text'][:2000]
            parts.append(f"Content: {text}")
        
        if content_data.get('description'):
            parts.append(f"Description: {content_data['description']}")
            
        return "\n\n".join(parts)
    
    def _create_analysis_prompt(self, content_text: str, content_data: Dict[str, Any]) -> str:
        """Create analysis prompt for Claude"""
        return f"""
Analyze the following content and provide a structured analysis in JSON format.

Content to analyze:
{content_text}

Please analyze and return a JSON object with the following fields:
- title: A clear, concise title (if not provided or needs improvement)
- summary: A brief 1-2 sentence summary
- category: One primary category (technology, business, entertainment, news, education, lifestyle, science, sports, politics, art, other)
- tags: 3-5 relevant tags/keywords
- sentiment: Overall sentiment (positive, negative, neutral)
- quality_score: Content quality from 0.0 to 1.0 based on informativeness and clarity
- topics: 2-4 main topics covered
- content_type: Type of content (article, video, social_post, product, image, other)
- language: Language code (en, es, fr, etc.)
- reading_time_minutes: Estimated reading time in minutes (for text content)
- key_points: 2-4 key points or takeaways

Respond only with valid JSON, no additional text.
"""
    
    def _parse_claude_response(self, response_text: str) -> ContentAnalysis:
        """Parse Claude's JSON response into ContentAnalysis object"""
        try:
            # Clean response text
            response_text = response_text.strip()
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            
            # Parse JSON
            analysis_data = json.loads(response_text)
            
            # Validate and create ContentAnalysis object
            return ContentAnalysis(**analysis_data)
            
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to parse Claude response: {e}")
            logger.debug(f"Response text: {response_text}")
            raise
    
    def _fallback_analysis(self, content_data: Dict[str, Any]) -> ContentAnalysis:
        """Fallback analysis when Claude AI is not available"""
        url = content_data.get('url', '')
        text = content_data.get('text', '')
        title = content_data.get('title', '')
        
        # Simple keyword-based categorization
        category = self._simple_categorize(url, text, title)
        
        # Extract basic information
        word_count = len(text.split()) if text else 0
        reading_time = max(1, word_count // 200) if word_count > 0 else None
        
        return ContentAnalysis(
            title=title or "Shared Content",
            summary=text[:200] + "..." if len(text) > 200 else text or "No description available",
            category=category,
            tags=self._extract_simple_tags(url, text, title),
            sentiment="neutral",
            quality_score=0.5,
            topics=[category],
            content_type=self._detect_content_type(url, content_data),
            language="en",
            reading_time_minutes=reading_time,
            key_points=[]
        )
    
    def _simple_categorize(self, url: str, text: str, title: str) -> str:
        """Simple keyword-based categorization fallback"""
        content = f"{url} {text} {title}".lower()
        
        categories = {
            'technology': ['tech', 'software', 'ai', 'machine learning', 'programming', 'code', 'github', 'api'],
            'business': ['business', 'startup', 'market', 'finance', 'investment', 'revenue', 'company'],
            'news': ['news', 'breaking', 'report', 'announce', 'update', 'latest'],
            'entertainment': ['entertainment', 'movie', 'music', 'game', 'show', 'celebrity', 'fun'],
            'education': ['learn', 'tutorial', 'guide', 'how to', 'education', 'course', 'teach'],
            'science': ['science', 'research', 'study', 'discovery', 'experiment', 'analysis'],
            'sports': ['sports', 'game', 'team', 'player', 'match', 'championship', 'score']
        }
        
        for category, keywords in categories.items():
            if any(keyword in content for keyword in keywords):
                return category
        
        return 'other'
    
    def _extract_simple_tags(self, url: str, text: str, title: str) -> List[str]:
        """Extract simple tags from content"""
        content = f"{url} {text} {title}".lower()
        
        # Common meaningful words that could be tags
        potential_tags = []
        
        # Extract from URL
        if url:
            domain_parts = url.split('/')[2].split('.') if '//' in url else []
            potential_tags.extend([part for part in domain_parts if len(part) > 2])
        
        # Simple word extraction (this could be improved with NLP)
        words = content.split()
        common_words = {'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an', 'is', 'are', 'was', 'were'}
        meaningful_words = [word for word in words if len(word) > 3 and word not in common_words]
        
        # Return up to 5 most relevant tags
        return potential_tags[:3] + meaningful_words[:2]
    
    def _detect_content_type(self, url: str, content_data: Dict[str, Any]) -> str:
        """Detect content type from URL and data"""
        if url:
            url_lower = url.lower()
            
            if any(domain in url_lower for domain in ['youtube.com', 'vimeo.com', 'twitch.tv']):
                return 'video'
            elif any(domain in url_lower for domain in ['twitter.com', 'x.com', 'linkedin.com']):
                return 'social_post'
            elif any(domain in url_lower for domain in ['github.com', 'stackoverflow.com']):
                return 'technical'
            elif any(ext in url_lower for ext in ['.jpg', '.png', '.gif', '.jpeg']):
                return 'image'
            elif any(domain in url_lower for domain in ['amazon.com', 'shop', 'store']):
                return 'product'
        
        return 'article'
    
    async def enhance_content(self, content: str, enhancement_type: str = "improve") -> Optional[str]:
        """
        Enhance content using Claude AI
        
        Args:
            content: Original content text
            enhancement_type: Type of enhancement (improve, summarize, expand)
            
        Returns:
            Enhanced content or None if enhancement fails
        """
        if not self.client:
            return content  # Return original content as fallback
        
        try:
            await self._check_rate_limit()
            
            prompt = f"""
Please {enhancement_type} the following content while maintaining its core meaning:

{content}

{"Improve the clarity and readability." if enhancement_type == "improve" else ""}
{"Create a concise summary." if enhancement_type == "summarize" else ""}
{"Expand with additional relevant details." if enhancement_type == "expand" else ""}
"""
            
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=800,
                temperature=0.5,
                messages=[{"role": "user", "content": prompt}]
            )
            
            self._request_timestamps.append(datetime.utcnow())
            
            enhanced_content = response.content[0].text.strip()
            logger.info(f"Successfully enhanced content ({enhancement_type})")
            
            return enhanced_content
            
        except Exception as e:
            logger.error(f"Content enhancement failed: {e}")
            return content  # Return original content on failure

    async def generate_content_recommendations(self, user_content_history: List[Dict[str, Any]], num_recommendations: int = 5) -> List[Dict[str, Any]]:
        """
        Generate personalized content recommendations based on user's content history
        """
        if not self.client or not user_content_history:
            return []
        
        try:
            await self._check_rate_limit()
            
            # Prepare content summary for analysis
            content_summary = []
            for item in user_content_history[-20:]:  # Last 20 items
                content_summary.append({
                    'category': item.get('category', 'other'),
                    'tags': item.get('tags', []),
                    'title': item.get('title', '')[:100]  # Truncate for token efficiency
                })
            
            prompt = f"""
Based on this user's content sharing history, suggest {num_recommendations} types of content they might be interested in:

Recent content: {json.dumps(content_summary, indent=2)}

Please respond with a JSON array of recommendations, each containing:
- content_type: Type of content to recommend
- topic: Specific topic or theme
- description: Brief description of why this would be relevant
- keywords: Array of relevant search keywords
- estimated_interest: Score from 0.0 to 1.0

Respond only with valid JSON array.
"""
            
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=1000,
                temperature=0.7,
                messages=[{"role": "user", "content": prompt}]
            )
            
            self._request_timestamps.append(datetime.utcnow())
            
            # Parse recommendations
            recommendations = json.loads(response.content[0].text.strip())
            
            logger.info(f"Generated {len(recommendations)} content recommendations")
            return recommendations
            
        except Exception as e:
            logger.error(f"Failed to generate recommendations: {e}")
            return []

    async def analyze_content_batch(self, content_batch: List[Dict[str, Any]]) -> List[ContentAnalysis]:
        """
        Analyze multiple content items in a single API call for efficiency
        """
        if not self.client or not content_batch:
            return []
        
        try:
            await self._check_rate_limit()
            
            # Prepare batch content for analysis
            batch_content = []
            for i, item in enumerate(content_batch):
                batch_content.append(f"Content {i+1}:\n{self._prepare_content_for_analysis(item)}\n")
            
            prompt = f"""
Analyze the following {len(content_batch)} content items and return a JSON array with analysis for each:

{chr(10).join(batch_content)}

For each content item, provide a JSON object with these fields:
- title, summary, category, tags, sentiment, quality_score, topics, content_type, language, reading_time_minutes, key_points

Respond with a JSON array containing exactly {len(content_batch)} analysis objects.
"""
            
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                temperature=0.3,
                messages=[{"role": "user", "content": prompt}]
            )
            
            self._request_timestamps.append(datetime.utcnow())
            
            # Parse batch results
            batch_results = json.loads(response.content[0].text.strip())
            
            # Convert to ContentAnalysis objects
            analyses = []
            for result in batch_results:
                try:
                    analyses.append(ContentAnalysis(**result))
                except Exception as e:
                    logger.error(f"Failed to parse batch result: {e}")
                    analyses.append(self._fallback_analysis({}))
            
            logger.info(f"Successfully analyzed batch of {len(analyses)} content items")
            return analyses
            
        except Exception as e:
            logger.error(f"Batch analysis failed: {e}")
            return [self._fallback_analysis({}) for _ in content_batch]

    async def generate_smart_tags(self, content_text: str, existing_tags: List[str] = None) -> List[str]:
        """
        Generate intelligent, contextually relevant tags for content
        """
        if not self.client:
            return existing_tags or []
        
        try:
            await self._check_rate_limit()
            
            existing_tags_text = f"Existing tags: {', '.join(existing_tags)}\n" if existing_tags else ""
            
            prompt = f"""
Generate 5-8 intelligent, specific tags for this content that would help with discovery and organization:

{existing_tags_text}
Content: {content_text[:1500]}

Requirements:
- Tags should be specific and meaningful
- Avoid generic tags like "interesting" or "content"
- Include technical terms if relevant
- Consider the content's purpose and audience
- If existing tags are provided, complement them (don't duplicate)

Respond with only a JSON array of tag strings.
"""
            
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=200,
                temperature=0.4,
                messages=[{"role": "user", "content": prompt}]
            )
            
            self._request_timestamps.append(datetime.utcnow())
            
            new_tags = json.loads(response.content[0].text.strip())
            
            # Combine with existing tags and deduplicate
            all_tags = list(set((existing_tags or []) + new_tags))
            
            logger.info(f"Generated {len(new_tags)} new smart tags")
            return all_tags[:10]  # Limit to 10 total tags
            
        except Exception as e:
            logger.error(f"Smart tag generation failed: {e}")
            return existing_tags or []

    async def cluster_content_by_similarity(self, content_items: List[Dict[str, Any]]) -> Dict[str, List[int]]:
        """
        Group content items into clusters based on similarity
        """
        if not self.client or len(content_items) < 2:
            return {"uncategorized": list(range(len(content_items)))}
        
        try:
            await self._check_rate_limit()
            
            # Prepare content summaries for clustering
            summaries = []
            for i, item in enumerate(content_items):
                summaries.append(f"Item {i}: {item.get('title', '')} | {item.get('category', '')} | {' '.join(item.get('tags', []))}")
            
            prompt = f"""
Analyze these {len(content_items)} content items and group them into meaningful clusters based on topic similarity:

{chr(10).join(summaries)}

Create clusters that group similar content together. Respond with a JSON object where:
- Keys are cluster names (descriptive, like "Web Development", "AI Research", etc.)
- Values are arrays of item indices that belong to that cluster

Example format:
{{
  "Web Development": [0, 3, 7],
  "Machine Learning": [1, 4, 5],
  "Business Strategy": [2, 6]
}}

Aim for 2-5 clusters with meaningful groupings.
"""
            
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=800,
                temperature=0.3,
                messages=[{"role": "user", "content": prompt}]
            )
            
            self._request_timestamps.append(datetime.utcnow())
            
            clusters = json.loads(response.content[0].text.strip())
            
            logger.info(f"Created {len(clusters)} content clusters")
            return clusters
            
        except Exception as e:
            logger.error(f"Content clustering failed: {e}")
            return {"uncategorized": list(range(len(content_items)))}

    async def generate_content_insights(self, content_data: Dict[str, Any], user_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Generate advanced insights about content including relevance, actionability, and learning potential
        """
        if not self.client:
            return {"insights": [], "relevance_score": 0.5}
        
        try:
            await self._check_rate_limit()
            
            user_context_text = ""
            if user_context:
                user_context_text = f"""
User context:
- Interests: {', '.join(user_context.get('interests', []))}
- Experience level: {user_context.get('experience_level', 'unknown')}
- Recent activity: {user_context.get('recent_categories', [])}
"""
            
            content_text = self._prepare_content_for_analysis(content_data)
            
            prompt = f"""
Provide advanced insights for this content:

{user_context_text}

Content: {content_text}

Analyze and provide insights in JSON format:
{{
  "insights": [
    {{
      "type": "insight_type",
      "title": "Insight title",
      "description": "Detailed insight description",
      "confidence": 0.0-1.0
    }}
  ],
  "relevance_score": 0.0-1.0,
  "learning_potential": 0.0-1.0,
  "actionability": 0.0-1.0,
  "time_investment": "quick_read|medium_read|deep_dive",
  "recommended_action": "save_for_later|read_now|share|skip",
  "related_topics": ["topic1", "topic2"],
  "difficulty_level": "beginner|intermediate|advanced"
}}

Focus on practical, actionable insights.
"""
            
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=1200,
                temperature=0.4,
                messages=[{"role": "user", "content": prompt}]
            )
            
            self._request_timestamps.append(datetime.utcnow())
            
            insights = json.loads(response.content[0].text.strip())
            
            logger.info("Generated advanced content insights")
            return insights
            
        except Exception as e:
            logger.error(f"Content insights generation failed: {e}")
            return {
                "insights": [{"type": "error", "title": "Analysis unavailable", "description": "Unable to generate insights", "confidence": 0.1}],
                "relevance_score": 0.5,
                "learning_potential": 0.5,
                "actionability": 0.5,
                "time_investment": "unknown",
                "recommended_action": "review",
                "related_topics": [],
                "difficulty_level": "unknown"
            }

# Global instance
claude_ai = ClaudeAIService()