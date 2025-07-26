#!/usr/bin/env python3
"""
Celery Worker Startup Script
"""
import os
import sys
import logging

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.background_processor import celery_app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

if __name__ == '__main__':
    logger.info("Starting Celery worker for Digital Wall MVP")
    
    # Start the worker
    celery_app.worker_main([
        'worker',
        '--loglevel=info',
        '--concurrency=2',
        '--queues=content_processing,ai_analysis,media_processing',
        '--hostname=digital-wall-worker@%h'
    ])