import asyncio
import html
import json
import re
from typing import Dict, List, Optional, Union, Any
from urllib.parse import urlparse, parse_qs
import httpx
from pydantic import BaseModel, HttpUrl
import logging

logger = logging.getLogger(__name__)

class OEmbedResponse(BaseModel):
    """Standard oEmbed response format"""
    type: str  # "video", "photo", "link", "rich"
    version: str = "1.0"
    title: Optional[str] = None
    author_name: Optional[str] = None
    author_url: Optional[HttpUrl] = None
    provider_name: Optional[str] = None
    provider_url: Optional[HttpUrl] = None
    cache_age: Optional[int] = None
    thumbnail_url: Optional[HttpUrl] = None
    thumbnail_width: Optional[int] = None
    thumbnail_height: Optional[int] = None

    # Type-specific fields
    url: Optional[HttpUrl] = None  # photo type
    width: Optional[int] = None    # photo/video type
    height: Optional[int] = None   # photo/video type
    html: Optional[str] = None     # video/rich type

    # Custom fields for our platform
    platform: Optional[str] = None
    platform_id: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[int] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    created_at: Optional[str] = None

class OEmbedProvider(BaseModel):
    """oEmbed provider configuration"""
    name: str
    url: str
    endpoint: str
    schemes: List[str]
    formats: List[str] = ["json"]
    supports_discovery: bool = True
    requires_auth: bool = False
    rate_limit: Optional[int] = None

class OEmbedService:
    """
    Comprehensive oEmbed service supporting multiple platforms

    Implements:
    1. Standard oEmbed protocol
    2. Platform-specific APIs
    3. Fallback content extraction
    4. Rate limiting and caching
    """

    def __init__(self):
        self.providers = self._load_providers()
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "Digital Wall MVP/1.0 (+https://digitalwall.app)"
            }
        )

    def _load_providers(self) -> Dict[str, OEmbedProvider]:
        """Load oEmbed provider configurations"""
        return {
            "youtube": OEmbedProvider(
                name="YouTube",
                url="https://www.youtube.com/",
                endpoint="https://www.youtube.com/oembed",
                schemes=[
                    "https://www.youtube.com/watch*",
                    "https://www.youtube.com/v/*",
                    "https://youtu.be/*",
                    "https://www.youtube.com/shorts/*"
                ]
            ),
            "vimeo": OEmbedProvider(
                name="Vimeo",
                url="https://vimeo.com/",
                endpoint="https://vimeo.com/api/oembed.json",
                schemes=[
                    "https://vimeo.com/*",
                    "https://player.vimeo.com/video/*"
                ]
            ),
            "twitter": OEmbedProvider(
                name="X (Twitter)",
                url="https://x.com/",
                endpoint="https://publish.twitter.com/oembed",
                schemes=[
                    "https://twitter.com/*/status/*",
                    "https://x.com/*/status/*",
                    "https://mobile.twitter.com/*/status/*"
                ]
            ),
            "soundcloud": OEmbedProvider(
                name="SoundCloud",
                url="https://soundcloud.com/",
                endpoint="https://soundcloud.com/oembed",
                schemes=[
                    "https://soundcloud.com/*",
                    "https://m.soundcloud.com/*"
                ]
            ),
            "instagram": OEmbedProvider(
                name="Instagram",
                url="https://instagram.com/",
                endpoint="https://graph.facebook.com/v18.0/instagram_oembed",
                schemes=[
                    "https://www.instagram.com/p/*",
                    "https://www.instagram.com/reel/*",
                    "https://instagram.com/p/*",
                    "https://instagram.com/reel/*"
                ],
                requires_auth=True
            ),
            "tiktok": OEmbedProvider(
                name="TikTok",
                url="https://www.tiktok.com/",
                endpoint="https://www.tiktok.com/oembed",
                schemes=[
                    "https://www.tiktok.com/@*/video/*",
                    "https://vm.tiktok.com/*",
                    "https://tiktok.com/@*/video/*"
                ]
            ),
            "reddit": OEmbedProvider(
                name="Reddit",
                url="https://reddit.com/",
                endpoint="https://www.reddit.com/oembed",
                schemes=[
                    "https://reddit.com/r/*/comments/*",
                    "https://www.reddit.com/r/*/comments/*",
                    "https://old.reddit.com/r/*/comments/*"
                ]
            ),
            "spotify": OEmbedProvider(
                name="Spotify",
                url="https://spotify.com/",
                endpoint="https://open.spotify.com/oembed",
                schemes=[
                    "https://open.spotify.com/track/*",
                    "https://open.spotify.com/album/*",
                    "https://open.spotify.com/playlist/*",
                    "https://open.spotify.com/episode/*",
                    "https://open.spotify.com/show/*"
                ]
            ),
            "pinterest": OEmbedProvider(
                name="Pinterest",
                url="https://pinterest.com/",
                endpoint="",
                schemes=[
                    "https://www.pinterest.com/pin/*",
                    "https://pinterest.com/pin/*",
                    "https://pin.it/*"
                ]
            )
        }

    async def get_oembed_data(self, url: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[OEmbedResponse]:
        """
        Get oEmbed data for a URL

        Args:
            url: The URL to get oEmbed data for
            max_width: Maximum width for embedded content
            max_height: Maximum height for embedded content

        Returns:
            OEmbedResponse object or None if not supported
        """
        try:
            # First, try to identify the provider
            provider = self._identify_provider(url)
            if not provider:
                logger.info(f"No oEmbed provider found for URL: {url}")
                return await self._extract_custom_platform(url, max_width, max_height)

            # Try platform-specific extraction first
            if provider.name == "YouTube":
                return await self._extract_youtube(url, max_width, max_height)
            elif provider.name == "Instagram":
                return await self._extract_instagram(url, max_width, max_height)
            elif provider.name == "Pinterest":
                return await self._extract_pinterest(url)
            elif provider.name == "TikTok":
                return await self._extract_tiktok(url, max_width, max_height)
            elif provider.name == "X (Twitter)":
                return await self._extract_twitter(url, max_width, max_height)

            # Fall back to standard oEmbed
            return await self._standard_oembed_request(provider, url, max_width, max_height)

        except Exception as e:
            logger.error(f"Error getting oEmbed data for {url}: {str(e)}")
            return await self._extract_custom_platform(url, max_width, max_height)

    def _identify_provider(self, url: str) -> Optional[OEmbedProvider]:
        """Identify the oEmbed provider for a given URL"""
        for provider in self.providers.values():
            for scheme in provider.schemes:
                # Convert scheme pattern to regex
                pattern = scheme.replace("*", ".*")
                if re.match(f"^{pattern}$", url):
                    return provider
        return None

    async def _standard_oembed_request(
        self,
        provider: OEmbedProvider,
        url: str,
        max_width: Optional[int] = None,
        max_height: Optional[int] = None
    ) -> Optional[OEmbedResponse]:
        """Make a standard oEmbed API request"""
        try:
            params = {
                "url": url,
                "format": "json"
            }

            if max_width:
                params["maxwidth"] = max_width
            if max_height:
                params["maxheight"] = max_height

            response = await self.client.get(provider.endpoint, params=params)
            response.raise_for_status()

            data = response.json()

            # Add platform-specific information
            data["platform"] = provider.name.lower().replace(" ", "_")
            data["provider_name"] = provider.name
            data["provider_url"] = provider.url

            return OEmbedResponse(**data)

        except Exception as e:
            logger.error(f"Standard oEmbed request failed for {provider.name}: {str(e)}")
            return None

    async def _extract_youtube(self, url: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[OEmbedResponse]:
        """Extract YouTube video information"""
        try:
            # Extract video ID
            video_id = self._extract_youtube_id(url)
            if not video_id:
                return None

            # First try standard oEmbed
            provider = self.providers["youtube"]
            oembed_data = await self._standard_oembed_request(provider, url, max_width, max_height)

            if oembed_data:
                # Enhance with additional YouTube-specific data
                oembed_data.platform = "youtube"
                oembed_data.platform_id = video_id

                # Try to get additional metadata (this would require YouTube API key)
                # For now, we'll use the basic oEmbed data
                return oembed_data

            return None

        except Exception as e:
            logger.error(f"YouTube extraction failed: {str(e)}")
            return None

    def _extract_youtube_id(self, url: str) -> Optional[str]:
        """Extract YouTube video ID from URL"""
        patterns = [
            r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([^&\n?#]+)',
            r'youtube\.com/shorts/([^&\n?#]+)'
        ]

        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)

        return None

    async def _extract_instagram(self, url: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[OEmbedResponse]:
        """Extract Instagram post information"""
        try:
            # Instagram requires Facebook access token for oEmbed
            # For now, we'll extract basic information from the URL and page

            post_id = self._extract_instagram_id(url)
            if not post_id:
                return None

            # Try to get page metadata
            metadata = await self._extract_page_metadata(url)

            if metadata:
                # Decode HTML entities in title and description
                title = html.unescape(metadata.get("title", "")) if metadata.get("title") else None
                description = html.unescape(metadata.get("description", "")) if metadata.get("description") else None

                # Create custom Instagram-style HTML
                custom_html = f'''
                <div class="instagram-embed-custom" style="border: 1px solid #dbdbdb; border-radius: 12px; width: 100%; max-width: 600px; margin: 0 auto; background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing: border-box;">
                    <div style="padding: 16px;">
                        <div style="display: flex; align-items: center; margin-bottom: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%); display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                </svg>
                            </div>
                            <div>
                                <div style="font-weight: 600; font-size: 14px;">Instagram Post</div>
                                <div style="font-size: 12px; color: #8e8e8e;">View on Instagram</div>
                            </div>
                        </div>
                        {f'<div style="margin-bottom: 12px;"><img src="{metadata.get("image")}" style="width: 100%; border-radius: 8px;" alt="Instagram post" /></div>' if metadata.get("image") else ''}
                        {f'<div style="font-size: 14px; line-height: 1.4; margin-bottom: 8px;">{title}</div>' if title else ''}
                        <div style="font-size: 12px; color: #8e8e8e;">
                            <a href="{url}" target="_blank" style="color: #0095f6; text-decoration: none;">View on Instagram</a>
                        </div>
                    </div>
                </div>
                '''

                return OEmbedResponse(
                    type="rich",
                    platform="instagram",
                    platform_id=post_id,
                    provider_name="Instagram",
                    provider_url="https://instagram.com/",
                    title=title,
                    description=description,
                    thumbnail_url=metadata.get("image"),
                    author_name=metadata.get("author"),
                    html=custom_html
                )

            return None

        except Exception as e:
            logger.error(f"Instagram extraction failed: {str(e)}")
            return None

    def _extract_instagram_id(self, url: str) -> Optional[str]:
        """Extract Instagram post ID from URL"""
        match = re.search(r'instagram\.com/(?:p|reel)/([^/?]+)', url)
        return match.group(1) if match else None

    async def _extract_tiktok(self, url: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[OEmbedResponse]:
        """Extract TikTok video information with proper embed"""
        try:
            # Try standard oEmbed first
            provider = self.providers["tiktok"]
            oembed_data = await self._standard_oembed_request(provider, url, max_width, max_height)

            if oembed_data and oembed_data.html:
                # TikTok oEmbed worked and has embed HTML
                oembed_data.platform = "tiktok"
                return oembed_data

            # Extract video ID for custom embed
            video_id = self._extract_tiktok_id(url)
            
            # Fallback to metadata extraction and create custom embed
            metadata = await self._extract_page_metadata(url)
            if metadata:
                title = metadata.get("title", "TikTok Video")
                description = metadata.get("description", "")
                thumbnail_url = metadata.get("image")

                # Create TikTok blockquote embed (official TikTok embed method)
                embed_html = f'''
                <div class="tiktok-embed-wrapper" style="width: 100%; max-width: 325px; margin: 0 auto;">
                    <blockquote class="tiktok-embed" 
                               cite="{url}" 
                               data-video-id="{video_id if video_id else ''}"
                               style="max-width: 325px; min-width: 325px; border: 1px solid #d9d9d9; border-radius: 8px; margin: 0 auto; padding: 0; background: white;">
                        <section style="padding: 16px;">
                            <a target="_blank" 
                               title="{title}" 
                               href="{url}"
                               style="text-decoration: none; color: #000;">
                                {f'<img src="{thumbnail_url}" style="width: 100%; border-radius: 6px; margin-bottom: 12px;" alt="TikTok video" />' if thumbnail_url else ''}
                                <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">{title}</div>
                                <div style="font-size: 14px; color: #666; margin-bottom: 12px;">{description}</div>
                                <div style="display: flex; align-items: center; font-size: 14px; color: #000;">
                                    <div style="width: 20px; height: 20px; margin-right: 8px;">
                                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 100%; height: 100%;">
                                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                                        </svg>
                                    </div>
                                    <span>♬ View on TikTok</span>
                                </div>
                            </a>
                        </section>
                    </blockquote>
                    <script async src="https://www.tiktok.com/embed.js"></script>
                </div>
                '''

                return OEmbedResponse(
                    type="rich",
                    platform="tiktok",
                    platform_id=video_id,
                    provider_name="TikTok",
                    provider_url="https://www.tiktok.com/",
                    title=title,
                    description=description,
                    thumbnail_url=thumbnail_url,
                    author_name=metadata.get("author"),
                    html=embed_html
                )

            return None

        except Exception as e:
            logger.error(f"TikTok extraction failed: {str(e)}")
            return None

    def _extract_tiktok_id(self, url: str) -> Optional[str]:
        """Extract TikTok video ID from URL"""
        # Pattern for TikTok video URLs
        patterns = [
            r'tiktok\.com/@[^/]+/video/(\d+)',
            r'vm\.tiktok\.com/([^/?]+)',
            r'tiktok\.com/t/([^/?]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None

    async def _extract_twitter(self, url: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[OEmbedResponse]:
        """Extract Twitter/X post information"""
        try:
            # Try standard oEmbed
            provider = self.providers["twitter"]
            oembed_data = await self._standard_oembed_request(provider, url, max_width, max_height)

            if oembed_data:
                oembed_data.platform = "twitter"

                # Extract tweet ID
                tweet_id = self._extract_twitter_id(url)
                if tweet_id:
                    oembed_data.platform_id = tweet_id

                return oembed_data

            return None

        except Exception as e:
            logger.error(f"Twitter extraction failed: {str(e)}")
            return None

    def _extract_twitter_id(self, url: str) -> Optional[str]:
        """Extract Twitter post ID from URL"""
        match = re.search(r'status/(\d+)', url)
        return match.group(1) if match else None

    async def _extract_page_metadata(self, url: str) -> Optional[Dict[str, Any]]:
        """Extract basic metadata from a web page"""
        try:
            response = await self.client.get(url, follow_redirects=True)
            response.raise_for_status()

            html_content = response.text
            metadata = {}

            # Extract Open Graph tags
            og_tags = {
                "title": r'<meta property="og:title" content="([^"]*)"',
                "description": r'<meta property="og:description" content="([^"]*)"',
                "image": r'<meta property="og:image" content="([^"]*)"',
                "author": r'<meta property="og:author" content="([^"]*)"',
                "type": r'<meta property="og:type" content="([^"]*)"'
            }

            for key, pattern in og_tags.items():
                match = re.search(pattern, html_content, re.IGNORECASE)
                if match:
                    metadata[key] = html.unescape(match.group(1))

            # Fallback to Twitter Card tags
            if not metadata.get("title"):
                match = re.search(r'<meta name="twitter:title" content="([^"]*)"', html_content, re.IGNORECASE)
                if match:
                    metadata["title"] = html.unescape(match.group(1))

            if not metadata.get("description"):
                match = re.search(r'<meta name="twitter:description" content="([^"]*)"', html_content, re.IGNORECASE)
                if match:
                    metadata["description"] = html.unescape(match.group(1))

            if not metadata.get("image"):
                match = re.search(r'<meta name="twitter:image" content="([^"]*)"', html_content, re.IGNORECASE)
                if match:
                    metadata["image"] = match.group(1)

            # Fallback to basic HTML tags
            if not metadata.get("title"):
                match = re.search(r'<title>([^<]*)</title>', html_content, re.IGNORECASE)
                if match:
                    metadata["title"] = html.unescape(match.group(1).strip())

            return metadata

        except Exception as e:
            logger.error(f"Metadata extraction failed for {url}: {str(e)}")
            return None

    async def _extract_custom_platform(self, url: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[OEmbedResponse]:
        """Extract content from custom/unsupported platforms"""
        try:
            parsed_url = urlparse(url)
            domain = parsed_url.netloc.lower()
            url_path = parsed_url.path.lower()

            # Handle eksisozluk
            if "eksisozluk.com" in domain:
                return await self._extract_eksisozluk(url)

            # Handle 4chan (note: posts are ephemeral)
            if "4chan.org" in domain or "4channel.org" in domain:
                return await self._extract_4chan(url)

            # Handle Pinterest (including pin.it redirects)
            if "pinterest.com" in domain or "pin.it" in domain:
                return await self._extract_pinterest(url)

            # Handle TikTok embeds (including short URLs and different formats)
            if ("tiktok.com" in domain or "vm.tiktok.com" in domain) and ("/video/" in url_path or "@" in url_path):
                return await self._extract_tiktok_custom(url)

            # Handle Facebook (various URL patterns)
            if ("facebook.com" in domain or "fb.com" in domain) and ("/share/" in url_path or "/posts/" in url_path or "/photo" in url_path or "/video" in url_path or "/story" in url_path):
                return await self._extract_facebook_custom(url)

            # General fallback
            return await self._fallback_extraction(url, max_width, max_height)

        except Exception as e:
            logger.error(f"Custom platform extraction failed: {str(e)}")
            return await self._fallback_extraction(url, max_width, max_height)

    async def _extract_eksisozluk(self, url: str) -> Optional[OEmbedResponse]:
        """Extract eksisozluk entry"""
        try:
            metadata = await self._extract_page_metadata(url)

            if metadata:
                title = metadata.get("title", "")
                description = metadata.get("description", "")

                # Create custom eksisozluk-style HTML
                custom_html = f'''
                <div class="eksisozluk-embed" style="border: 1px solid #e5e5e5; border-radius: 8px; width: 100%; max-width: 600px; margin: 0 auto; background: white; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; box-sizing: border-box;">
                    <div style="background: #53a245; color: white; padding: 12px; border-radius: 8px 8px 0 0;">
                        <div style="display: flex; align-items: center;">
                            <div style="font-weight: bold; font-size: 16px;">ekşi sözlük</div>
                        </div>
                    </div>
                    <div style="padding: 16px;">
                        {f'<div style="font-weight: 600; margin-bottom: 8px; color: #333;">{title}</div>' if title else ''}
                        {f'<div style="color: #666; font-size: 14px; line-height: 1.4; margin-bottom: 12px;">{description}</div>' if description else ''}
                        <div style="font-size: 12px; color: #999;">
                            <a href="{url}" target="_blank" style="color: #53a245; text-decoration: none;">ekşi sözlük'te oku</a>
                        </div>
                    </div>
                </div>
                '''

                return OEmbedResponse(
                    type="rich",
                    platform="eksisozluk",
                    provider_name="ekşi sözlük",
                    provider_url="https://eksisozluk.com/",
                    title=title,
                    description=description,
                    thumbnail_url=metadata.get("image"),
                    html=custom_html
                )

            return None
        except Exception as e:
            logger.error(f"eksisozluk extraction failed: {str(e)}")
            return None

    async def _extract_4chan(self, url: str) -> Optional[OEmbedResponse]:
        """Extract 4chan post (limited due to ephemeral nature)"""
        try:
            # Extract board and post info from URL
            match = re.search(r'4chan\.org/([^/]+)/thread/(\d+)', url)
            if not match:
                return None

            board, thread_id = match.groups()

            # Try to get basic metadata (posts often 404 quickly)
            metadata = await self._extract_page_metadata(url)

            title = f"/{board}/ thread #{thread_id}" if not metadata or not metadata.get("title") else metadata.get("title")
            description = metadata.get("description") if metadata else "4chan post (may no longer be available)"

            # Create simple 4chan-style embed
            custom_html = f'''
            <div class="fourchan-embed" style="border: 1px solid #d9bfd9; border-radius: 4px; width: 100%; max-width: 600px; margin: 0 auto; background: #f0e0d6; font-family: arial, helvetica, sans-serif; box-sizing: border-box;">
                <div style="background: #d9bfd9; padding: 8px; border-radius: 4px 4px 0 0;">
                    <div style="font-weight: bold; color: #800080;">4chan /{board}/</div>
                </div>
                <div style="padding: 12px;">
                    <div style="font-weight: 600; margin-bottom: 8px; color: #000080;">{title}</div>
                    {f'<div style="color: #333; font-size: 13px; margin-bottom: 8px;">{description}</div>' if description else ''}
                    <div style="font-size: 11px; color: #999;">
                        <a href="{url}" target="_blank" style="color: #800080; text-decoration: none;">View post (if still available)</a>
                    </div>
                </div>
            </div>
            '''

            return OEmbedResponse(
                type="rich",
                platform="4chan",
                provider_name="4chan",
                provider_url="https://4chan.org/",
                title=title,
                description=description,
                html=custom_html
            )

        except Exception as e:
            logger.error(f"4chan extraction failed: {str(e)}")
            return None

    async def _extract_pinterest(self, url: str) -> Optional[OEmbedResponse]:
        """Extract Pinterest pin with actual Pinterest embed"""
        try:
            # Handle pin.it redirects
            if "pin.it" in url:
                # Follow redirect to get actual Pinterest URL
                response = await self.client.head(url, follow_redirects=True)
                url = str(response.url)

            # Extract pin ID from Pinterest URL
            pin_id = self._extract_pinterest_id(url)
            if not pin_id:
                return None

            metadata = await self._extract_page_metadata(url)

            if metadata:
                title = metadata.get("title", "Pinterest Pin")
                description = metadata.get("description", "")

                # Use Pinterest's official embed iframe
                custom_html = f'''
                <div class="pinterest-embed" style="width: 100%; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                    <iframe src="https://assets.pinterest.com/ext/embed.html?id={pin_id}" 
                            height="345" 
                            width="100%" 
                            frameborder="0" 
                            scrolling="no"
                            style="border-radius: 12px; display: block;"
                            title="{title}">
                    </iframe>
                </div>
                '''

                return OEmbedResponse(
                    type="rich",
                    platform="pinterest",
                    platform_id=pin_id,
                    provider_name="Pinterest",
                    provider_url="https://pinterest.com/",
                    title=title,
                    description=description,
                    thumbnail_url=metadata.get("image"),
                    html=custom_html
                )

            return None
        except Exception as e:
            logger.error(f"Pinterest extraction failed: {str(e)}")
            return None
    
    def _extract_pinterest_id(self, url: str) -> Optional[str]:
        """Extract Pinterest pin ID from URL"""
        # Pattern for Pinterest pin URLs
        match = re.search(r'pinterest\.com/pin/(\d+)', url)
        return match.group(1) if match else None

    async def _extract_tiktok_custom(self, url: str) -> Optional[OEmbedResponse]:
        """Extract TikTok with custom fallback"""
        try:
            # First try official TikTok oEmbed
            result = await self._extract_tiktok(url)
            if result and result.html:
                # Official TikTok oEmbed worked and has HTML
                return result
            elif result and not result.html:
                # Official TikTok oEmbed worked but no HTML - enhance with custom HTML
                metadata = await self._extract_page_metadata(url)
                
                title = result.title or metadata.get("title", "TikTok Video") if metadata else result.title or "TikTok Video"
                description = result.description or metadata.get("description", "") if metadata else result.description or ""
                thumbnail_url = result.thumbnail_url or metadata.get("image") if metadata else result.thumbnail_url
                
                # Create enhanced custom HTML when official oEmbed lacks HTML
                custom_html = f'''
                <div class="tiktok-embed-custom" style="border: 1px solid #e5e5e5; border-radius: 12px; width: 100%; max-width: 600px; margin: 0 auto; background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing: border-box; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                    <div style="background: #000; color: white; padding: 12px; border-radius: 12px 12px 0 0;">
                        <div style="display: flex; align-items: center;">
                            <div style="width: 24px; height: 24px; margin-right: 12px;">
                                <svg viewBox="0 0 24 24" fill="white" style="width: 100%; height: 100%;">
                                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                                </svg>
                            </div>
                            <div style="font-weight: bold; font-size: 16px;">TikTok</div>
                        </div>
                    </div>
                    <div style="padding: 16px;">
                        {f'<div style="position: relative; margin-bottom: 12px;"><img src="{thumbnail_url}" style="width: 100%; border-radius: 8px;" alt="TikTok video" /><div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; background: rgba(0,0,0,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center;"><svg style="width: 24px; height: 24px; fill: white; margin-left: 3px;" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>' if thumbnail_url else ''}
                        {f'<div style="font-weight: 600; margin-bottom: 8px; color: #333; font-size: 16px;">{title}</div>' if title else ''}
                        {f'<div style="color: #666; font-size: 14px; line-height: 1.4; margin-bottom: 12px;">{description}</div>' if description else ''}
                        {f'<div style="color: #888; font-size: 13px; margin-bottom: 8px;">By {result.author_name}</div>' if result.author_name else ''}
                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #666;">
                            <span>Video content • TikTok</span>
                            <a href="{url}" target="_blank" style="color: #000; text-decoration: none; font-weight: 600;">Watch on TikTok →</a>
                        </div>
                    </div>
                </div>
                '''
                
                # Return enhanced result with custom HTML
                result.html = custom_html
                result.type = "rich"  # Change from video to rich since we're providing HTML
                return result

            # Fallback to custom extraction when official oEmbed completely fails
            metadata = await self._extract_page_metadata(url)

            if metadata:
                title = metadata.get("title", "TikTok Video")
                description = metadata.get("description", "")
                thumbnail_url = metadata.get("image")

                custom_html = f'''
                <div class="tiktok-embed-custom" style="border: 1px solid #e5e5e5; border-radius: 12px; width: 100%; max-width: 600px; margin: 0 auto; background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing: border-box; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                    <div style="background: #000; color: white; padding: 12px; border-radius: 12px 12px 0 0;">
                        <div style="display: flex; align-items: center;">
                            <div style="width: 24px; height: 24px; margin-right: 12px;">
                                <svg viewBox="0 0 24 24" fill="white" style="width: 100%; height: 100%;">
                                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                                </svg>
                            </div>
                            <div style="font-weight: bold; font-size: 16px;">TikTok</div>
                        </div>
                    </div>
                    <div style="padding: 16px;">
                        {f'<div style="position: relative; margin-bottom: 12px;"><img src="{thumbnail_url}" style="width: 100%; border-radius: 8px;" alt="TikTok video" /><div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; background: rgba(0,0,0,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center;"><svg style="width: 24px; height: 24px; fill: white; margin-left: 3px;" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>' if thumbnail_url else ''}
                        {f'<div style="font-weight: 600; margin-bottom: 8px; color: #333; font-size: 16px;">{title}</div>' if title else ''}
                        {f'<div style="color: #666; font-size: 14px; line-height: 1.4; margin-bottom: 12px;">{description}</div>' if description else ''}
                        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #666;">
                            <span>Video content • TikTok</span>
                            <a href="{url}" target="_blank" style="color: #000; text-decoration: none; font-weight: 600;">Watch on TikTok →</a>
                        </div>
                    </div>
                </div>
                '''

                return OEmbedResponse(
                    type="rich",
                    platform="tiktok",
                    provider_name="TikTok",
                    provider_url="https://tiktok.com/",
                    title=title,
                    description=description,
                    thumbnail_url=thumbnail_url,
                    html=custom_html
                )

            return None
        except Exception as e:
            logger.error(f"TikTok custom extraction failed: {str(e)}")
            return None

    async def _extract_facebook_custom(self, url: str) -> Optional[OEmbedResponse]:
        """Extract Facebook content with enhanced rich preview"""
        try:
            # Extract Facebook post/video ID from URL
            facebook_id = self._extract_facebook_id(url)
            
            metadata = await self._extract_page_metadata(url)

            if metadata:
                title = metadata.get("title", "Facebook Post")
                description = metadata.get("description", "")
                image_url = metadata.get("image")
                
                # Check if it's a video post
                is_video = "video" in url.lower() or "video" in title.lower() or metadata.get("type") == "video"

                # Enhanced Facebook embed with richer content display
                image_section = ""
                if image_url:
                    play_button = ""
                    if is_video:
                        play_button = '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; background: rgba(0,0,0,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center;"><svg style="width: 24px; height: 24px; fill: white; margin-left: 3px;" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>'
                    
                    image_section = f'''
                        <div style="position: relative; margin-bottom: 12px;">
                            <img src="{image_url}" style="width: 100%; border-radius: 8px;" alt="Facebook content" />
                            {play_button}
                        </div>'''

                title_section = f'<div style="font-weight: 600; margin-bottom: 8px; color: #333; font-size: 16px; line-height: 1.3;">{title}</div>' if title else ''
                description_section = f'<div style="color: #666; font-size: 14px; line-height: 1.4; margin-bottom: 12px;">{description}</div>' if description else ''
                content_type = "🎥 Video content" if is_video else "📱 Post content"

                custom_html = f'''
                <div class="facebook-embed" style="border: 1px solid #e5e5e5; border-radius: 12px; width: 100%; max-width: 600px; margin: 0 auto; background: white; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; box-sizing: border-box; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                    <div style="background: #1877f2; color: white; padding: 12px; border-radius: 12px 12px 0 0;">
                        <div style="display: flex; align-items: center;">
                            <div style="width: 24px; height: 24px; margin-right: 12px;">
                                <svg viewBox="0 0 24 24" fill="white" style="width: 100%; height: 100%;">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                </svg>
                            </div>
                            <div style="font-weight: bold; font-size: 16px;">Facebook</div>
                        </div>
                    </div>
                    <div style="padding: 16px;">
                        {image_section}
                        {title_section}
                        {description_section}
                        <div style="background: #f7f8fa; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                            <div style="font-size: 13px; color: #8a8d91; line-height: 1.4;">
                                {content_type} • Due to Facebook's privacy settings, full content embedding is limited
                            </div>
                        </div>
                        <div style="position: relative;">
                            <div style="position: absolute; top: 8px; right: 8px; width: 16px; height: 16px; opacity: 0.6;">
                                <svg viewBox="0 0 24 24" fill="#8a8d91" style="width: 100%; height: 100%;">
                                    <path d="M11 9h2v2h-2zm0 4h2v6h-2zm1-9C6.48 4 2 8.48 2 14s4.48 10 10 10 10-4.48 10-10S17.52 4 12 4zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                '''

                return OEmbedResponse(
                    type="rich",
                    platform="facebook",
                    platform_id=facebook_id,
                    provider_name="Facebook",
                    provider_url="https://facebook.com/",
                    title=title,
                    description=description,
                    thumbnail_url=image_url,
                    html=custom_html
                )

            return None
        except Exception as e:
            logger.error(f"Facebook extraction failed: {str(e)}")
            return None

    def _extract_facebook_id(self, url: str) -> Optional[str]:
        """Extract Facebook post/video ID from URL"""
        # Patterns for Facebook URLs
        patterns = [
            r'facebook\.com/[^/]+/posts/(\d+)',
            r'facebook\.com/[^/]+/videos/(\d+)',
            r'facebook\.com/photo\.php\?fbid=(\d+)',
            r'facebook\.com/[^/]+/photos/[^/]+/(\d+)',
            r'facebook\.com/story\.php\?story_fbid=(\d+)',
            r'facebook\.com/share/[^/]*/?.*?u=.*?%2F(\d+)',
            r'fbid=(\d+)',
            r'story_fbid=(\d+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None

    async def _fallback_extraction(self, url: str, max_width: Optional[int] = None, max_height: Optional[int] = None) -> Optional[OEmbedResponse]:
        """Fallback extraction for unsupported URLs"""
        try:
            metadata = await self._extract_page_metadata(url)

            if metadata:
                title = metadata.get("title", "")
                description = metadata.get("description", "")
                domain = urlparse(url).netloc

                # Create a generic rich embed
                custom_html = f'''
                <div class="generic-embed" style="border: 1px solid #e5e5e5; border-radius: 8px; width: 100%; max-width: 600px; margin: 0 auto; background: white; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; box-sizing: border-box;">
                    <div style="padding: 16px;">
                        {f'<div style="font-weight: 600; margin-bottom: 8px; color: #333; font-size: 16px;">{title}</div>' if title else ''}
                        {f'<div style="color: #666; font-size: 14px; line-height: 1.4; margin-bottom: 12px;">{description}</div>' if description else ''}
                        {f'<div style="margin-bottom: 12px;"><img src="{metadata.get("image")}" style="width: 100%; border-radius: 6px;" alt="Preview" /></div>' if metadata.get("image") else ''}
                        <div style="font-size: 12px; color: #999; display: flex; align-items: center; justify-content: space-between;">
                            <span>{domain}</span>
                            <a href="{url}" target="_blank" style="color: #0066cc; text-decoration: none;">Visit link →</a>
                        </div>
                    </div>
                </div>
                '''

                return OEmbedResponse(
                    type="rich",
                    platform="generic",
                    provider_name=domain,
                    provider_url=f"https://{domain}",
                    title=title,
                    description=description,
                    thumbnail_url=metadata.get("image"),
                    html=custom_html
                )

            return None
        except Exception as e:
            logger.error(f"Fallback extraction failed: {str(e)}")
            return None

    async def batch_get_oembed_data(self, urls: List[str], max_width: Optional[int] = None, max_height: Optional[int] = None) -> Dict[str, Optional[OEmbedResponse]]:
        """Get oEmbed data for multiple URLs concurrently"""
        try:
            tasks = [self.get_oembed_data(url, max_width, max_height) for url in urls]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            return {
                url: result if not isinstance(result, Exception) else None
                for url, result in zip(urls, results)
            }

        except Exception as e:
            logger.error(f"Batch oEmbed extraction failed: {str(e)}")
            return {url: None for url in urls}

    def is_supported_url(self, url: str) -> bool:
        """Check if a URL is supported by any oEmbed provider or custom platform"""
        # First check official oEmbed providers
        if self._identify_provider(url) is not None:
            return True

        # Then check custom platforms
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.lower()

        custom_platforms = [
            "eksisozluk.com",
            "4chan.org",
            "4channel.org",
            "facebook.com",
            "fb.com",
            "pinterest.com",
            "pin.it",
            "tiktok.com",
            "vm.tiktok.com"
        ]

        # Check domain match
        if any(platform in domain for platform in custom_platforms):
            return True

        # Additional pattern checks for Facebook URLs
        if "facebook.com" in domain and ("/share/" in url or "/posts/" in url or "/photo" in url or "/video" in url):
            return True

        return False

    def get_supported_platforms(self) -> List[str]:
        """Get list of supported platforms"""
        return list(self.providers.keys())

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()

# Global instance
oembed_service = OEmbedService()
