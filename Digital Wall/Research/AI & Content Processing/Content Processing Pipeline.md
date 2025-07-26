# [[Content Processing Pipeline]] - AI-Powered Metadata Extraction

## Overview & Core Concepts

The **Content Processing Pipeline** orchestrates the end-to-end transformation of user-shared content into rich, searchable, and intelligently organized [[Digital Wall]] items. This document covers the complete pipeline architecture, from initial content ingestion through AI analysis to final storage and indexing.

### Pipeline Architecture Components
- **[[Content Ingestion]]**: Multi-source content reception and validation
- **[[Metadata Extraction]]**: URL analysis, file processing, and content parsing
- **[[AI Analysis]]**: [[Claude Sonnet 4 Integration]] for intelligent understanding
- **[[Data Enrichment]]**: Additional metadata and context enhancement
- **[[Storage & Indexing]]**: Optimized storage and search preparation

## Technical Deep Dive

### Pipeline Orchestration Framework

```python
# app/pipelines/content_processor.py - Main pipeline orchestrator
import asyncio
import logging
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
import uuid

from app.core.database import AsyncSessionLocal
from app.services.ai_service import ClaudeSonnet4Client, ContentAnalysisRequest
from app.services.metadata_extractor import MetadataExtractorService
from app.services.file_processor import FileProcessorService
from app.services.url_analyzer import URLAnalyzerService
from app.services.storage_service import StorageService
from app.utils.monitoring import PipelineMetrics

logger = logging.getLogger(__name__)

class ProcessingStage(Enum):
    INGESTION = "ingestion"
    VALIDATION = "validation"
    METADATA_EXTRACTION = "metadata_extraction"
    AI_ANALYSIS = "ai_analysis"
    ENRICHMENT = "enrichment"
    STORAGE = "storage"
    INDEXING = "indexing"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class ContentItem:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    content_type: str = ""  # url, text, image, video, file
    primary_content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    files: List[Any] = field(default_factory=list)
    user_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)
    
    # Processing state
    stage: ProcessingStage = ProcessingStage.INGESTION
    processing_errors: List[str] = field(default_factory=list)
    processing_warnings: List[str] = field(default_factory=list)
    
    # Results
    extracted_metadata: Optional[Dict[str, Any]] = None
    ai_analysis: Optional[Dict[str, Any]] = None
    enriched_data: Optional[Dict[str, Any]] = None
    final_result: Optional[Dict[str, Any]] = None

class ContentProcessingPipeline:
    def __init__(self):
        self.ai_client = ClaudeSonnet4Client()
        self.metadata_extractor = MetadataExtractorService()
        self.file_processor = FileProcessorService()
        self.url_analyzer = URLAnalyzerService()
        self.storage_service = StorageService()
        self.metrics = PipelineMetrics()
        
        # Pipeline configuration
        self.max_concurrent_items = 10
        self.stage_timeout = 300  # 5 minutes per stage
        self.retry_attempts = 3
    
    async def process_content_batch(
        self,
        content_items: List[ContentItem],
        progress_callback: Optional[callable] = None
    ) -> List[ContentItem]:
        """Process multiple content items through the pipeline"""
        
        logger.info(f"Starting batch processing for {len(content_items)} items")
        
        # Track batch metrics
        batch_id = str(uuid.uuid4())
        await self.metrics.start_batch(batch_id, len(content_items))
        
        try:
            # Process with controlled concurrency
            semaphore = asyncio.Semaphore(self.max_concurrent_items)
            
            async def process_single_item(item: ContentItem, index: int) -> ContentItem:
                async with semaphore:
                    try:
                        processed_item = await self.process_single_content(item)
                        
                        if progress_callback:
                            await progress_callback(index + 1, len(content_items), processed_item)
                        
                        return processed_item
                        
                    except Exception as e:
                        logger.error(f"Item processing failed: {e}")
                        item.stage = ProcessingStage.FAILED
                        item.processing_errors.append(str(e))
                        return item
            
            # Execute batch processing
            tasks = [
                process_single_item(item, i) 
                for i, item in enumerate(content_items)
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Handle any exceptions
            processed_items = []
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"Batch item failed: {result}")
                    # Create failed item
                    failed_item = ContentItem()
                    failed_item.stage = ProcessingStage.FAILED
                    failed_item.processing_errors.append(str(result))
                    processed_items.append(failed_item)
                else:
                    processed_items.append(result)
            
            # Update batch metrics
            successful = sum(1 for item in processed_items if item.stage == ProcessingStage.COMPLETED)
            failed = len(processed_items) - successful
            
            await self.metrics.complete_batch(batch_id, successful, failed)
            
            logger.info(f"Batch processing completed: {successful} successful, {failed} failed")
            
            return processed_items
            
        except Exception as e:
            logger.error(f"Batch processing error: {e}")
            await self.metrics.fail_batch(batch_id, str(e))
            raise
    
    async def process_single_content(self, item: ContentItem) -> ContentItem:
        """Process single content item through complete pipeline"""
        
        item_id = item.id
        logger.info(f"Processing item {item_id}: {item.content_type}")
        
        # Track item processing
        await self.metrics.start_item_processing(item_id)
        
        try:
            # Stage 1: Validation
            item = await self._validate_content(item)
            if item.stage == ProcessingStage.FAILED:
                return item
            
            # Stage 2: Metadata Extraction
            item = await self._extract_metadata(item)
            if item.stage == ProcessingStage.FAILED:
                return item
            
            # Stage 3: AI Analysis
            item = await self._analyze_with_ai(item)
            if item.stage == ProcessingStage.FAILED:
                return item
            
            # Stage 4: Data Enrichment
            item = await self._enrich_content(item)
            if item.stage == ProcessingStage.FAILED:
                return item
            
            # Stage 5: Storage
            item = await self._store_content(item)
            if item.stage == ProcessingStage.FAILED:
                return item
            
            # Stage 6: Indexing
            item = await self._index_content(item)
            if item.stage == ProcessingStage.FAILED:
                return item
            
            # Mark as completed
            item.stage = ProcessingStage.COMPLETED
            logger.info(f"Successfully processed item {item_id}")
            
            await self.metrics.complete_item_processing(item_id)
            
            return item
            
        except Exception as e:
            logger.error(f"Processing failed for item {item_id}: {e}")
            item.stage = ProcessingStage.FAILED
            item.processing_errors.append(str(e))
            
            await self.metrics.fail_item_processing(item_id, str(e))
            
            return item
    
    async def _validate_content(self, item: ContentItem) -> ContentItem:
        """Validate content item before processing"""
        
        item.stage = ProcessingStage.VALIDATION
        
        try:
            # Content type validation
            if not item.content_type:
                if item.primary_content.startswith(('http://', 'https://')):
                    item.content_type = 'url'
                elif item.files:
                    item.content_type = 'file'
                else:
                    item.content_type = 'text'
            
            # Content size validation
            if item.content_type == 'text':
                if len(item.primary_content) > 10000:  # 10KB limit for text
                    item.processing_warnings.append("Text content truncated to 10KB")
                    item.primary_content = item.primary_content[:10000]
            
            # File validation
            if item.files:
                validated_files = []
                for file_obj in item.files:
                    if await self._validate_file(file_obj):
                        validated_files.append(file_obj)
                    else:
                        item.processing_warnings.append(f"File {file_obj.filename} failed validation")
                
                item.files = validated_files
            
            # URL validation
            if item.content_type == 'url':
                if not await self._validate_url(item.primary_content):
                    raise ValueError("Invalid or inaccessible URL")
            
            logger.debug(f"Content validation completed for {item.id}")
            return item
            
        except Exception as e:
            logger.error(f"Content validation failed: {e}")
            item.stage = ProcessingStage.FAILED
            item.processing_errors.append(f"Validation error: {str(e)}")
            return item
    
    async def _extract_metadata(self, item: ContentItem) -> ContentItem:
        """Extract metadata from content"""
        
        item.stage = ProcessingStage.METADATA_EXTRACTION
        
        try:
            extracted_metadata = {}
            
            # URL metadata extraction
            if item.content_type == 'url':
                url_metadata = await self.url_analyzer.analyze_url(
                    item.primary_content,
                    timeout=30
                )
                extracted_metadata.update(url_metadata)
            
            # File metadata extraction
            if item.files:
                file_metadata = []
                for file_obj in item.files:
                    file_meta = await self.file_processor.extract_metadata(file_obj)
                    file_metadata.append(file_meta)
                
                extracted_metadata['files'] = file_metadata
            
            # Text content analysis
            if item.content_type == 'text':
                text_metadata = await self.metadata_extractor.analyze_text(
                    item.primary_content
                )
                extracted_metadata.update(text_metadata)
            
            item.extracted_metadata = extracted_metadata
            logger.debug(f"Metadata extraction completed for {item.id}")
            return item
            
        except Exception as e:
            logger.error(f"Metadata extraction failed: {e}")
            item.stage = ProcessingStage.FAILED
            item.processing_errors.append(f"Metadata extraction error: {str(e)}")
            return item
    
    async def _analyze_with_ai(self, item: ContentItem) -> ContentItem:
        """Analyze content with AI"""
        
        item.stage = ProcessingStage.AI_ANALYSIS
        
        try:
            # Prepare AI analysis request
            analysis_request = ContentAnalysisRequest(
                content_type=item.content_type,
                primary_content=item.primary_content,
                context={
                    'extracted_metadata': item.extracted_metadata,
                    'timestamp': item.timestamp.isoformat(),
                    'user_id': item.user_id
                },
                analysis_depth="standard"
            )
            
            # Perform AI analysis with timeout
            ai_result = await asyncio.wait_for(
                self.ai_client.analyze_content(analysis_request),
                timeout=60.0
            )
            
            # Convert Pydantic model to dict
            item.ai_analysis = ai_result.model_dump()
            
            logger.debug(f"AI analysis completed for {item.id}")
            return item
            
        except asyncio.TimeoutError:
            logger.warning(f"AI analysis timed out for {item.id}")
            item.processing_warnings.append("AI analysis timed out, using fallback")
            # Continue with fallback analysis
            item.ai_analysis = self._generate_fallback_analysis(item)
            return item
            
        except Exception as e:
            logger.error(f"AI analysis failed: {e}")
            item.processing_warnings.append(f"AI analysis failed: {str(e)}")
            # Continue with fallback analysis
            item.ai_analysis = self._generate_fallback_analysis(item)
            return item
    
    async def _enrich_content(self, item: ContentItem) -> ContentItem:
        """Enrich content with additional data"""
        
        item.stage = ProcessingStage.ENRICHMENT
        
        try:
            enriched_data = {}
            
            # Combine metadata and AI analysis
            if item.extracted_metadata:
                enriched_data['metadata'] = item.extracted_metadata
            
            if item.ai_analysis:
                enriched_data['analysis'] = item.ai_analysis
            
            # Add processing metadata
            enriched_data['processing'] = {
                'processed_at': datetime.now().isoformat(),
                'pipeline_version': '1.0',
                'processing_time': (datetime.now() - item.timestamp).total_seconds(),
                'warnings': item.processing_warnings
            }
            
            # Generate search keywords
            keywords = set()
            if item.ai_analysis:
                keywords.update(item.ai_analysis.get('tags', []))
                keywords.update(item.ai_analysis.get('topics', []))
            
            if item.extracted_metadata:
                # Add domain for URLs
                if item.content_type == 'url' and 'domain' in item.extracted_metadata:
                    keywords.add(item.extracted_metadata['domain'])
            
            enriched_data['search_keywords'] = list(keywords)
            
            # Generate display metadata
            enriched_data['display'] = {
                'title': item.ai_analysis.get('title', 'Shared Content') if item.ai_analysis else 'Shared Content',
                'description': item.ai_analysis.get('description', '') if item.ai_analysis else '',
                'thumbnail': item.extracted_metadata.get('image') if item.extracted_metadata else None,
                'preview': self._generate_preview(item)
            }
            
            item.enriched_data = enriched_data
            logger.debug(f"Content enrichment completed for {item.id}")
            return item
            
        except Exception as e:
            logger.error(f"Content enrichment failed: {e}")
            item.processing_warnings.append(f"Enrichment error: {str(e)}")
            # Continue with minimal enriched data
            item.enriched_data = {
                'metadata': item.extracted_metadata or {},
                'analysis': item.ai_analysis or {},
                'search_keywords': [],
                'display': {
                    'title': 'Shared Content',
                    'description': '',
                    'thumbnail': None,
                    'preview': item.primary_content[:200]
                }
            }
            return item
    
    async def _store_content(self, item: ContentItem) -> ContentItem:
        """Store processed content"""
        
        item.stage = ProcessingStage.STORAGE
        
        try:
            # Prepare final data structure
            final_data = {
                'id': item.id,
                'user_id': item.user_id,
                'content_type': item.content_type,
                'primary_content': item.primary_content,
                'timestamp': item.timestamp.isoformat(),
                **item.enriched_data
            }
            
            # Store in database
            async with AsyncSessionLocal() as db:
                stored_id = await self.storage_service.store_content_item(
                    db, final_data
                )
            
            # Store files if present
            if item.files:
                file_urls = await self.storage_service.store_files(
                    item.files, item.user_id
                )
                final_data['file_urls'] = file_urls
            
            item.final_result = final_data
            logger.debug(f"Content storage completed for {item.id}")
            return item
            
        except Exception as e:
            logger.error(f"Content storage failed: {e}")
            item.stage = ProcessingStage.FAILED
            item.processing_errors.append(f"Storage error: {str(e)}")
            return item
    
    async def _index_content(self, item: ContentItem) -> ContentItem:
        """Index content for search"""
        
        item.stage = ProcessingStage.INDEXING
        
        try:
            # Prepare search index data
            search_data = {
                'id': item.id,
                'user_id': item.user_id,
                'title': item.enriched_data['display']['title'],
                'description': item.enriched_data['display']['description'],
                'content': item.primary_content,
                'keywords': item.enriched_data['search_keywords'],
                'category': item.ai_analysis.get('category') if item.ai_analysis else 'other',
                'tags': item.ai_analysis.get('tags', []) if item.ai_analysis else [],
                'timestamp': item.timestamp.isoformat(),
                'quality_score': item.ai_analysis.get('quality_score', 0.5) if item.ai_analysis else 0.5
            }
            
            # Index in search engine (placeholder for actual implementation)
            await self.storage_service.index_for_search(search_data)
            
            logger.debug(f"Content indexing completed for {item.id}")
            return item
            
        except Exception as e:
            logger.warning(f"Content indexing failed (non-critical): {e}")
            item.processing_warnings.append(f"Indexing warning: {str(e)}")
            # Indexing failure is non-critical, continue
            return item
```

### URL Analysis Service

```python
# app/services/url_analyzer.py - URL metadata extraction
import aiohttp
import asyncio
from typing import Dict, Any, Optional
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)

class URLAnalyzerService:
    def __init__(self):
        self.session_timeout = aiohttp.ClientTimeout(total=30)
        self.user_agent = "DigitalWall/1.0 (+https://digitalwall.app)"
    
    async def analyze_url(
        self, 
        url: str, 
        timeout: int = 30,
        extract_content: bool = True
    ) -> Dict[str, Any]:
        """Comprehensive URL analysis and metadata extraction"""
        
        try:
            parsed_url = urlparse(url)
            domain = parsed_url.netloc.lower()
            
            # Basic URL metadata
            metadata = {
                'url': url,
                'domain': domain,
                'path': parsed_url.path,
                'protocol': parsed_url.scheme
            }
            
            # Domain-specific extractors
            if 'github.com' in domain:
                github_metadata = await self._extract_github_metadata(url)
                metadata.update(github_metadata)
            elif 'youtube.com' in domain or 'youtu.be' in domain:
                youtube_metadata = await self._extract_youtube_metadata(url)
                metadata.update(youtube_metadata)
            elif 'twitter.com' in domain or 'x.com' in domain:
                twitter_metadata = await self._extract_twitter_metadata(url)
                metadata.update(twitter_metadata)
            
            # General webpage extraction
            if extract_content:
                page_metadata = await self._extract_page_metadata(url, timeout)
                metadata.update(page_metadata)
            
            return metadata
            
        except Exception as e:
            logger.error(f"URL analysis failed for {url}: {e}")
            return {
                'url': url,
                'domain': urlparse(url).netloc,
                'error': str(e),
                'status': 'failed'
            }
    
    async def _extract_page_metadata(
        self, 
        url: str, 
        timeout: int
    ) -> Dict[str, Any]:
        """Extract general webpage metadata"""
        
        metadata = {}
        
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=timeout),
            headers={'User-Agent': self.user_agent}
        ) as session:
            try:
                async with session.get(url) as response:
                    if response.status != 200:
                        metadata['status_code'] = response.status
                        metadata['error'] = f"HTTP {response.status}"
                        return metadata
                    
                    content_type = response.headers.get('content-type', '')
                    if 'text/html' not in content_type:
                        metadata['content_type'] = content_type
                        metadata['non_html'] = True
                        return metadata
                    
                    # Parse HTML content
                    html_content = await response.text()
                    soup = BeautifulSoup(html_content, 'html.parser')
                    
                    # Extract basic metadata
                    metadata.update(self._extract_html_metadata(soup, url))
                    
                    # Extract Open Graph metadata
                    og_metadata = self._extract_og_metadata(soup)
                    if og_metadata:
                        metadata['open_graph'] = og_metadata
                    
                    # Extract Twitter Card metadata
                    twitter_metadata = self._extract_twitter_card_metadata(soup)
                    if twitter_metadata:
                        metadata['twitter_card'] = twitter_metadata
                    
                    # Extract JSON-LD structured data
                    jsonld_metadata = self._extract_jsonld_metadata(soup)
                    if jsonld_metadata:
                        metadata['json_ld'] = jsonld_metadata
                    
                    metadata['status'] = 'success'
                    
            except asyncio.TimeoutError:
                metadata['error'] = 'Request timeout'
                metadata['status'] = 'timeout'
            except Exception as e:
                metadata['error'] = str(e)
                metadata['status'] = 'error'
        
        return metadata
    
    def _extract_html_metadata(self, soup: BeautifulSoup, url: str) -> Dict[str, Any]:
        """Extract basic HTML metadata"""
        
        metadata = {}
        
        # Title
        title_tag = soup.find('title')
        if title_tag:
            metadata['title'] = title_tag.get_text().strip()
        
        # Meta description
        desc_tag = soup.find('meta', attrs={'name': 'description'})
        if desc_tag:
            metadata['description'] = desc_tag.get('content', '').strip()
        
        # Meta keywords
        keywords_tag = soup.find('meta', attrs={'name': 'keywords'})
        if keywords_tag:
            keywords = keywords_tag.get('content', '').strip()
            metadata['keywords'] = [k.strip() for k in keywords.split(',') if k.strip()]
        
        # Author
        author_tag = soup.find('meta', attrs={'name': 'author'})
        if author_tag:
            metadata['author'] = author_tag.get('content', '').strip()
        
        # Language
        html_tag = soup.find('html')
        if html_tag and html_tag.get('lang'):
            metadata['language'] = html_tag.get('lang')
        
        # Images
        images = []
        img_tags = soup.find_all('img', src=True)[:5]  # Limit to first 5 images
        for img in img_tags:
            img_src = img.get('src')
            if img_src:
                # Convert relative URLs to absolute
                img_url = urljoin(url, img_src)
                images.append({
                    'url': img_url,
                    'alt': img.get('alt', ''),
                    'title': img.get('title', '')
                })
        
        if images:
            metadata['images'] = images
            metadata['image'] = images[0]['url']  # Primary image
        
        return metadata
    
    def _extract_og_metadata(self, soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
        """Extract Open Graph metadata"""
        
        og_tags = soup.find_all('meta', property=lambda x: x and x.startswith('og:'))
        if not og_tags:
            return None
        
        og_data = {}
        for tag in og_tags:
            property_name = tag.get('property', '')[3:]  # Remove 'og:' prefix
            content = tag.get('content', '').strip()
            if property_name and content:
                og_data[property_name] = content
        
        return og_data if og_data else None
    
    def _extract_twitter_card_metadata(self, soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
        """Extract Twitter Card metadata"""
        
        twitter_tags = soup.find_all('meta', attrs={'name': lambda x: x and x.startswith('twitter:')})
        if not twitter_tags:
            return None
        
        twitter_data = {}
        for tag in twitter_tags:
            name = tag.get('name', '')[8:]  # Remove 'twitter:' prefix
            content = tag.get('content', '').strip()
            if name and content:
                twitter_data[name] = content
        
        return twitter_data if twitter_data else None
    
    def _extract_jsonld_metadata(self, soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
        """Extract JSON-LD structured data"""
        
        import json
        
        jsonld_scripts = soup.find_all('script', type='application/ld+json')
        if not jsonld_scripts:
            return None
        
        structured_data = []
        for script in jsonld_scripts:
            try:
                data = json.loads(script.string)
                structured_data.append(data)
            except json.JSONDecodeError:
                continue
        
        return structured_data if structured_data else None
    
    async def _extract_github_metadata(self, url: str) -> Dict[str, Any]:
        """Extract GitHub-specific metadata"""
        
        metadata = {'platform': 'github'}
        
        # Parse GitHub URL structure
        path_parts = urlparse(url).path.strip('/').split('/')
        if len(path_parts) >= 2:
            metadata['owner'] = path_parts[0]
            metadata['repository'] = path_parts[1]
            
            # Determine content type
            if len(path_parts) == 2:
                metadata['content_type'] = 'repository'
            elif len(path_parts) > 2 and path_parts[2] == 'blob':
                metadata['content_type'] = 'file'
            elif len(path_parts) > 2 and path_parts[2] == 'issues':
                metadata['content_type'] = 'issue'
            elif len(path_parts) > 2 and path_parts[2] == 'pull':
                metadata['content_type'] = 'pull_request'
        
        return metadata
    
    async def _extract_youtube_metadata(self, url: str) -> Dict[str, Any]:
        """Extract YouTube-specific metadata"""
        
        metadata = {'platform': 'youtube'}
        
        # Extract video ID
        if 'youtu.be/' in url:
            video_id = url.split('youtu.be/')[-1].split('?')[0]
        elif 'watch?v=' in url:
            video_id = url.split('watch?v=')[-1].split('&')[0]
        else:
            return metadata
        
        metadata['video_id'] = video_id
        metadata['content_type'] = 'video'
        
        return metadata
    
    async def _extract_twitter_metadata(self, url: str) -> Dict[str, Any]:
        """Extract Twitter-specific metadata"""
        
        metadata = {'platform': 'twitter'}
        
        # Parse Twitter URL structure
        path_parts = urlparse(url).path.strip('/').split('/')
        if len(path_parts) >= 2:
            metadata['username'] = path_parts[0]
            
            if len(path_parts) >= 3 and path_parts[1] == 'status':
                metadata['content_type'] = 'tweet'
                metadata['tweet_id'] = path_parts[2]
        
        return metadata
```

### File Processing Service

```python
# app/services/file_processor.py - File metadata extraction
import asyncio
import mimetypes
from typing import Dict, Any, Optional, BinaryIO
import logging
from PIL import Image, ExifTags
import io

logger = logging.getLogger(__name__)

class FileProcessorService:
    def __init__(self):
        self.max_file_size = 50 * 1024 * 1024  # 50MB
        self.supported_types = {
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'video/quicktime',
            'application/pdf', 'text/plain'
        }
    
    async def extract_metadata(self, file_obj) -> Dict[str, Any]:
        """Extract comprehensive file metadata"""
        
        try:
            # Basic file information
            metadata = {
                'filename': getattr(file_obj, 'filename', 'unknown'),
                'size': getattr(file_obj, 'size', 0),
                'content_type': getattr(file_obj, 'content_type', 'application/octet-stream')
            }
            
            # Validate file size
            if metadata['size'] > self.max_file_size:
                metadata['error'] = 'File too large'
                return metadata
            
            # Read file content for analysis
            if hasattr(file_obj, 'read'):
                content = await file_obj.read()
                if hasattr(file_obj, 'seek'):
                    await file_obj.seek(0)  # Reset file pointer
            else:
                content = file_obj
            
            # Content-type specific processing
            if metadata['content_type'].startswith('image/'):
                image_metadata = await self._process_image_file(content)
                metadata.update(image_metadata)
            elif metadata['content_type'].startswith('video/'):
                video_metadata = await self._process_video_file(content)
                metadata.update(video_metadata)
            elif metadata['content_type'] == 'application/pdf':
                pdf_metadata = await self._process_pdf_file(content)
                metadata.update(pdf_metadata)
            elif metadata['content_type'].startswith('text/'):
                text_metadata = await self._process_text_file(content)
                metadata.update(text_metadata)
            
            metadata['status'] = 'processed'
            return metadata
            
        except Exception as e:
            logger.error(f"File processing failed: {e}")
            return {
                'filename': getattr(file_obj, 'filename', 'unknown'),
                'error': str(e),
                'status': 'failed'
            }
    
    async def _process_image_file(self, content: bytes) -> Dict[str, Any]:
        """Process image file for metadata"""
        
        metadata = {}
        
        try:
            # Open image with PIL
            image = Image.open(io.BytesIO(content))
            
            metadata.update({
                'width': image.width,
                'height': image.height,
                'format': image.format.lower() if image.format else 'unknown',
                'mode': image.mode,
                'aspect_ratio': round(image.width / image.height, 2) if image.height > 0 else 0
            })
            
            # Extract EXIF data
            if hasattr(image, '_getexif'):
                exif_data = image._getexif()
                if exif_data:
                    exif_metadata = {}
                    
                    for tag_id, value in exif_data.items():
                        tag = ExifTags.TAGS.get(tag_id, tag_id)
                        
                        # Extract useful EXIF data
                        if tag == 'DateTime':
                            exif_metadata['date_taken'] = str(value)
                        elif tag == 'Make':
                            exif_metadata['camera_make'] = str(value)
                        elif tag == 'Model':
                            exif_metadata['camera_model'] = str(value)
                        elif tag == 'Software':
                            exif_metadata['software'] = str(value)
                        elif tag == 'Orientation':
                            exif_metadata['orientation'] = int(value)
                    
                    if exif_metadata:
                        metadata['exif'] = exif_metadata
            
            # Color analysis
            if image.mode in ('RGB', 'RGBA'):
                colors = await self._analyze_image_colors(image)
                metadata['colors'] = colors
            
        except Exception as e:
            logger.warning(f"Image processing error: {e}")
            metadata['processing_error'] = str(e)
        
        return metadata
    
    async def _analyze_image_colors(self, image: Image.Image) -> Dict[str, Any]:
        """Analyze dominant colors in image"""
        
        try:
            # Resize for faster processing
            image = image.resize((150, 150))
            
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Get dominant colors using simple sampling
            pixels = list(image.getdata())
            
            # Sample every 10th pixel to reduce computation
            sampled_pixels = pixels[::10]
            
            # Simple color categorization
            color_categories = {
                'red': 0, 'green': 0, 'blue': 0,
                'yellow': 0, 'purple': 0, 'orange': 0,
                'brown': 0, 'gray': 0, 'black': 0, 'white': 0
            }
            
            for r, g, b in sampled_pixels:
                # Simple color classification
                if r > 200 and g > 200 and b > 200:
                    color_categories['white'] += 1
                elif r < 50 and g < 50 and b < 50:
                    color_categories['black'] += 1
                elif abs(r - g) < 30 and abs(g - b) < 30:
                    color_categories['gray'] += 1
                elif r > g and r > b:
                    if g > 100:
                        color_categories['orange'] += 1
                    else:
                        color_categories['red'] += 1
                elif g > r and g > b:
                    color_categories['green'] += 1
                elif b > r and b > g:
                    color_categories['blue'] += 1
                elif r > b and g > b:
                    color_categories['yellow'] += 1
                else:
                    color_categories['brown'] += 1
            
            # Find dominant color
            dominant_color = max(color_categories, key=color_categories.get)
            
            return {
                'dominant_color': dominant_color,
                'color_distribution': color_categories
            }
            
        except Exception as e:
            logger.warning(f"Color analysis error: {e}")
            return {'error': str(e)}
    
    async def _process_video_file(self, content: bytes) -> Dict[str, Any]:
        """Process video file for metadata"""
        
        metadata = {}
        
        try:
            # For video processing, we'd typically use ffprobe or similar
            # This is a placeholder implementation
            metadata.update({
                'type': 'video',
                'size_bytes': len(content),
                'processing_note': 'Video metadata extraction requires ffmpeg/ffprobe'
            })
            
            # Video file signature detection
            if content.startswith(b'\x00\x00\x00\x20ftypmp4'):
                metadata['container'] = 'mp4'
            elif content.startswith(b'\x1a\x45\xdf\xa3'):
                metadata['container'] = 'webm'
            
        except Exception as e:
            logger.warning(f"Video processing error: {e}")
            metadata['processing_error'] = str(e)
        
        return metadata
    
    async def _process_pdf_file(self, content: bytes) -> Dict[str, Any]:
        """Process PDF file for metadata"""
        
        metadata = {}
        
        try:
            # PDF processing would require PyPDF2 or similar
            metadata.update({
                'type': 'pdf',
                'size_bytes': len(content),
                'processing_note': 'PDF metadata extraction requires PyPDF2 or similar library'
            })
            
            # Basic PDF signature check
            if content.startswith(b'%PDF-'):
                pdf_version = content[5:8].decode('ascii', errors='ignore')
                metadata['pdf_version'] = pdf_version
            
        except Exception as e:
            logger.warning(f"PDF processing error: {e}")
            metadata['processing_error'] = str(e)
        
        return metadata
    
    async def _process_text_file(self, content: bytes) -> Dict[str, Any]:
        """Process text file for metadata"""
        
        metadata = {}
        
        try:
            # Decode text content
            text_content = content.decode('utf-8', errors='ignore')
            
            metadata.update({
                'type': 'text',
                'character_count': len(text_content),
                'line_count': text_content.count('\n') + 1,
                'word_count': len(text_content.split()),
                'encoding': 'utf-8'
            })
            
            # Extract first few lines as preview
            lines = text_content.split('\n')[:5]
            metadata['preview'] = '\n'.join(lines)
            
            # Simple language detection (placeholder)
            if any(char in text_content for char in 'àáäâèéëêìíïîòóöôùúüûñç'):
                metadata['language_hint'] = 'romance_language'
            elif any(char in text_content for char in 'αβγδεζηθικλμνξοπρστυφχψω'):
                metadata['language_hint'] = 'greek'
            else:
                metadata['language_hint'] = 'unknown'
            
        except Exception as e:
            logger.warning(f"Text processing error: {e}")
            metadata['processing_error'] = str(e)
        
        return metadata
```

## Integration Examples

### Complete Processing Pipeline Architecture

```mermaid
graph TD
    A[Content Input] --> B[Pipeline Orchestrator]
    B --> C[Content Validation]
    C --> D[Metadata Extraction]
    
    subgraph "Metadata Extractors"
        E[URL Analyzer]
        F[File Processor]
        G[Text Analyzer]
    end
    
    D --> E
    D --> F
    D --> G
    
    E --> H[[[Claude Sonnet 4 Integration]]]
    F --> H
    G --> H
    
    H --> I[Data Enrichment]
    I --> J[Storage Service]
    J --> K[Search Indexing]
    
    subgraph "Storage Layer"
        L[[[Cloudflare R2 Storage]]]
        M[PostgreSQL Database]
        N[Redis Cache]
    end
    
    J --> L
    J --> M
    K --> N
    
    subgraph "Monitoring"
        O[Pipeline Metrics]
        P[Error Tracking]
        Q[Performance Monitoring]
    end
    
    B --> O
    O --> P
    O --> Q
```

### Integration with [[Digital Wall]] Components

- **[[FastAPI Async Architecture]]**: Pipeline API endpoints and background task processing
- **[[Claude Sonnet 4 Integration]]**: AI-powered content analysis within the pipeline
- **[[Cloudflare R2 Storage]]**: File storage and serving for processed content
- **[[Next.js 14 PWA Patterns]]**: Frontend pipeline status monitoring and progress display

## References & Further Reading

### Technical Documentation
- [AsyncIO Patterns](https://docs.python.org/3/library/asyncio.html)
- [BeautifulSoup Documentation](https://www.crummy.com/software/BeautifulSoup/bs4/doc/)
- [Pillow (PIL) Documentation](https://pillow.readthedocs.io/)

### Pipeline Architecture
- [Data Pipeline Best Practices](https://en.wikipedia.org/wiki/Data_pipeline)
- [ETL vs ELT Patterns](https://www.integrate.io/blog/etl-vs-elt/)

### Related [[Vault]] Concepts
- [[Data Processing]] - Data transformation and analysis patterns
- [[Async Programming]] - Asynchronous processing architectures  
- [[Metadata Extraction]] - Content analysis and enrichment techniques
- [[Pipeline Orchestration]] - Workflow management and coordination
- [[Content Analysis]] - Automated content understanding methods

#digital-wall #research #content-processing #pipeline #metadata #ai-analysis