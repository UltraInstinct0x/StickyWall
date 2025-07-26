import re
from typing import Optional, List
from fastapi import UploadFile
from urllib.parse import urlparse


class ContentProcessor:
    """Service for processing and analyzing shared content."""
    
    def __init__(self):
        # Common image file extensions
        self.image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'}
        # Common video file extensions  
        self.video_extensions = {'.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm'}
        # Common document extensions
        self.document_extensions = {'.pdf', '.doc', '.docx', '.txt', '.rtf'}
    
    def detect_content_type(
        self, 
        title: Optional[str] = None,
        text: Optional[str] = None, 
        url: Optional[str] = None,
        files: Optional[List[UploadFile]] = None
    ) -> str:
        """
        Detect the primary content type based on the shared data.
        
        Returns one of: 'url', 'text', 'image', 'video', 'document', 'mixed'
        """
        content_types = []
        
        # Check if there are files
        if files:
            for file in files:
                if file.filename:
                    file_ext = self._get_file_extension(file.filename)
                    if file_ext in self.image_extensions:
                        content_types.append('image')
                    elif file_ext in self.video_extensions:
                        content_types.append('video') 
                    elif file_ext in self.document_extensions:
                        content_types.append('document')
                    else:
                        content_types.append('file')
        
        # Check URL
        if url and self._is_valid_url(url):
            # Try to determine URL content type
            url_type = self._analyze_url(url)
            content_types.append(url_type)
        
        # Check text content
        if text and len(text.strip()) > 0:
            # Check if text contains URLs
            if self._contains_urls(text):
                content_types.append('url')
            else:
                content_types.append('text')
        
        # Determine primary content type
        if len(content_types) == 0:
            return 'text'  # Default
        elif len(content_types) == 1:
            return content_types[0]
        elif len(set(content_types)) == 1:
            return content_types[0]  # All same type
        else:
            return 'mixed'  # Multiple different types
    
    def _get_file_extension(self, filename: str) -> str:
        """Extract file extension from filename."""
        return filename.lower().split('.')[-1] if '.' in filename else ''
    
    def _is_valid_url(self, url: str) -> bool:
        """Check if string is a valid URL."""
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except:
            return False
    
    def _analyze_url(self, url: str) -> str:
        """Analyze URL to determine content type."""
        url_lower = url.lower()
        
        # Check for image URLs
        if any(ext in url_lower for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
            return 'image'
        
        # Check for video URLs
        if any(ext in url_lower for ext in ['.mp4', '.avi', '.mov', '.webm']):
            return 'video'
        
        # Check for PDF URLs
        if '.pdf' in url_lower:
            return 'document'
        
        # Check for common video platforms
        video_domains = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com']
        if any(domain in url_lower for domain in video_domains):
            return 'video'
        
        # Check for common image hosting
        image_domains = ['imgur.com', 'flickr.com', 'instagram.com']
        if any(domain in url_lower for domain in image_domains):
            return 'image'
        
        # Default to URL
        return 'url'
    
    def _contains_urls(self, text: str) -> bool:
        """Check if text contains URLs."""
        url_pattern = re.compile(
            r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        )
        return bool(url_pattern.search(text))
    
    def extract_metadata(
        self,
        title: Optional[str] = None,
        text: Optional[str] = None,
        url: Optional[str] = None,
        files: Optional[List[UploadFile]] = None
    ) -> dict:
        """Extract additional metadata from content."""
        metadata = {}
        
        # Text analysis
        if text:
            metadata.update({
                'text_length': len(text),
                'word_count': len(text.split()),
                'has_urls': self._contains_urls(text)
            })
        
        # URL analysis
        if url:
            parsed_url = urlparse(url)
            metadata.update({
                'domain': parsed_url.netloc,
                'url_scheme': parsed_url.scheme,
                'url_path': parsed_url.path
            })
        
        # File analysis
        if files:
            file_info = []
            total_size = 0
            for file in files:
                info = {
                    'filename': file.filename,
                    'content_type': file.content_type
                }
                if hasattr(file, 'size') and file.size:
                    info['size'] = file.size
                    total_size += file.size
                file_info.append(info)
            
            metadata.update({
                'file_count': len(files),
                'files': file_info,
                'total_file_size': total_size
            })
        
        return metadata