"""
Cloudflare R2 Storage Service
Handles file uploads, storage, and CDN integration
"""
import os
import uuid
import hashlib
from typing import Optional, Union, BinaryIO
from datetime import datetime, timedelta
import mimetypes
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import httpx
from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

class R2StorageService:
    """
    Cloudflare R2 storage service with CDN integration
    """
    
    def __init__(self):
        self.account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
        self.access_key_id = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID")
        self.secret_access_key = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("CLOUDFLARE_R2_BUCKET", "digital-wall-storage")
        self.cdn_domain = os.getenv("CLOUDFLARE_CDN_DOMAIN", f"{self.bucket_name}.r2.dev")
        
        if not all([self.account_id, self.access_key_id, self.secret_access_key]):
            logger.warning("Cloudflare R2 credentials not configured, using local storage fallback")
            self.client = None
            return
            
        # Configure R2 client
        self.client = boto3.client(
            's3',
            endpoint_url=f'https://{self.account_id}.r2.cloudflarestorage.com',
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            config=Config(
                signature_version='s3v4',
                retries={'max_attempts': 3}
            ),
            region_name='auto'
        )
        
        # Initialize bucket if needed
        self._ensure_bucket_exists()
    
    def _ensure_bucket_exists(self):
        """Ensure the R2 bucket exists"""
        if not self.client:
            return
            
        try:
            self.client.head_bucket(Bucket=self.bucket_name)
        except ClientError as e:
            error_code = int(e.response['Error']['Code'])
            if error_code == 404:
                # Bucket doesn't exist, create it
                try:
                    self.client.create_bucket(Bucket=self.bucket_name)
                    logger.info(f"Created R2 bucket: {self.bucket_name}")
                except ClientError as create_error:
                    logger.error(f"Failed to create bucket: {create_error}")
            else:
                logger.error(f"Error checking bucket: {e}")
    
    def _generate_object_key(self, filename: str, content_type: str = None) -> str:
        """Generate a unique object key for storage"""
        # Get file extension
        _, ext = os.path.splitext(filename.lower())
        if not ext and content_type:
            # Try to get extension from content type
            ext = mimetypes.guess_extension(content_type) or ''
        
        # Generate unique filename
        timestamp = datetime.utcnow().strftime("%Y/%m/%d")
        unique_id = str(uuid.uuid4())
        
        return f"content/{timestamp}/{unique_id}{ext}"
    
    def _get_content_hash(self, content: bytes) -> str:
        """Generate SHA-256 hash of content for deduplication"""
        return hashlib.sha256(content).hexdigest()
    
    async def upload_file(
        self, 
        file_content: Union[bytes, BinaryIO], 
        filename: str,
        content_type: str = None,
        metadata: dict = None
    ) -> dict:
        """
        Upload file to R2 storage
        
        Returns:
            dict: Upload result with URL, key, and metadata
        """
        if not self.client:
            return await self._fallback_local_storage(file_content, filename, content_type)
        
        try:
            # Read content if it's a file-like object
            if hasattr(file_content, 'read'):
                content = file_content.read()
            else:
                content = file_content
            
            # Generate object key
            object_key = self._generate_object_key(filename, content_type)
            
            # Detect content type if not provided
            if not content_type:
                content_type, _ = mimetypes.guess_type(filename)
                content_type = content_type or 'application/octet-stream'
            
            # Calculate content hash for deduplication
            content_hash = self._get_content_hash(content)
            
            # Prepare metadata
            upload_metadata = {
                'original-filename': filename,
                'upload-timestamp': datetime.utcnow().isoformat(),
                'content-hash': content_hash,
                'content-length': str(len(content))
            }
            if metadata:
                upload_metadata.update(metadata)
            
            # Upload to R2
            self.client.put_object(
                Bucket=self.bucket_name,
                Key=object_key,
                Body=content,
                ContentType=content_type,
                Metadata=upload_metadata,
                CacheControl='public, max-age=31536000'  # 1 year cache
            )
            
            # Generate CDN URL
            cdn_url = f"https://{self.cdn_domain}/{object_key}"
            
            logger.info(f"Successfully uploaded {filename} to R2: {object_key}")
            
            return {
                'success': True,
                'url': cdn_url,
                'key': object_key,
                'content_type': content_type,
                'size': len(content),
                'hash': content_hash,
                'metadata': upload_metadata
            }
            
        except ClientError as e:
            logger.error(f"R2 upload failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'fallback': await self._fallback_local_storage(file_content, filename, content_type)
            }
        except Exception as e:
            logger.error(f"Upload error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _fallback_local_storage(self, file_content, filename: str, content_type: str = None) -> dict:
        """Fallback to local storage when R2 is not available"""
        try:
            # Create local storage directory
            storage_dir = "uploads"
            os.makedirs(storage_dir, exist_ok=True)
            
            # Generate unique filename
            unique_filename = f"{uuid.uuid4()}_{filename}"
            file_path = os.path.join(storage_dir, unique_filename)
            
            # Read content if it's a file-like object
            if hasattr(file_content, 'read'):
                content = file_content.read()
            else:
                content = file_content
            
            # Save to local file
            with open(file_path, 'wb') as f:
                f.write(content)
            
            return {
                'success': True,
                'url': f"/uploads/{unique_filename}",
                'key': unique_filename,
                'content_type': content_type or 'application/octet-stream',
                'size': len(content),
                'local': True
            }
            
        except Exception as e:
            logger.error(f"Local storage fallback failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def delete_file(self, object_key: str) -> bool:
        """Delete file from R2 storage"""
        if not self.client:
            return self._delete_local_file(object_key)
        
        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=object_key)
            logger.info(f"Deleted file from R2: {object_key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to delete from R2: {e}")
            return False
    
    def _delete_local_file(self, filename: str) -> bool:
        """Delete file from local storage"""
        try:
            file_path = os.path.join("uploads", filename)
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete local file: {e}")
            return False
    
    async def generate_presigned_url(self, object_key: str, expires_in: int = 3600) -> str:
        """Generate presigned URL for direct uploads"""
        if not self.client:
            return f"/upload/{object_key}"
        
        try:
            url = self.client.generate_presigned_url(
                'put_object',
                Params={'Bucket': self.bucket_name, 'Key': object_key},
                ExpiresIn=expires_in
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None
    
    async def optimize_image(self, image_content: bytes, max_width: int = 1200) -> bytes:
        """Optimize image for web delivery"""
        try:
            with Image.open(io.BytesIO(image_content)) as img:
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'LA', 'P'):
                    rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                    rgb_img.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = rgb_img
                
                # Resize if too large
                if img.width > max_width:
                    ratio = max_width / img.width
                    new_height = int(img.height * ratio)
                    img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                
                # Save optimized image
                output = io.BytesIO()
                img.save(output, format='JPEG', quality=85, optimize=True)
                return output.getvalue()
                
        except Exception as e:
            logger.error(f"Image optimization failed: {e}")
            return image_content  # Return original if optimization fails

# Global instance
r2_storage = R2StorageService()