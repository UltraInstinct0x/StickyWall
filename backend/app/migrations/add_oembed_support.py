"""
Database migration to add oEmbed support

This migration adds the necessary tables and columns to support
oEmbed integration for rich content previews and local content preservation.

Run this migration after updating to the oEmbed-enabled version.
"""

import asyncio
import logging
from sqlalchemy import text, inspect
from sqlalchemy.exc import OperationalError, ProgrammingError

import sys
import os
sys.path.append('/app')

from app.core.database import engine, AsyncSessionLocal
from app.models.models import Base, OEmbedData, OEmbedCache

logger = logging.getLogger(__name__)

async def check_table_exists(table_name: str) -> bool:
    """Check if a table exists in the database"""
    try:
        async with engine.begin() as conn:
            # For SQLite
            result = await conn.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=:table_name"
            ), {"table_name": table_name})
            return result.fetchone() is not None
    except Exception as e:
        logger.error(f"Error checking table existence: {e}")
        return False

async def check_column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    try:
        async with engine.begin() as conn:
            # For SQLite, get table info
            result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
            columns = [row[1] for row in result.fetchall()]  # Column names are in index 1
            return column_name in columns
    except Exception as e:
        logger.error(f"Error checking column existence: {e}")
        return False

async def add_oembed_columns_to_share_items():
    """Add oEmbed-related columns to existing share_items table"""
    try:
        async with engine.begin() as conn:
            # Check if columns already exist
            has_oembed = await check_column_exists("share_items", "has_oembed")
            has_oembed_processed = await check_column_exists("share_items", "oembed_processed")

            if not has_oembed:
                await conn.execute(text(
                    "ALTER TABLE share_items ADD COLUMN has_oembed BOOLEAN DEFAULT FALSE"
                ))
                logger.info("Added has_oembed column to share_items")

            if not has_oembed_processed:
                await conn.execute(text(
                    "ALTER TABLE share_items ADD COLUMN oembed_processed BOOLEAN DEFAULT FALSE"
                ))
                logger.info("Added oembed_processed column to share_items")

            await conn.commit()

    except Exception as e:
        logger.error(f"Error adding oEmbed columns to share_items: {e}")
        raise

async def create_oembed_tables():
    """Create the new oEmbed-related tables"""
    try:
        async with engine.begin() as conn:
            # Check if tables already exist
            oembed_data_exists = await check_table_exists("oembed_data")
            oembed_cache_exists = await check_table_exists("oembed_cache")

            if not oembed_data_exists:
                # Create oembed_data table
                await conn.execute(text("""
                    CREATE TABLE oembed_data (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        share_item_id INTEGER NOT NULL UNIQUE,
                        oembed_type VARCHAR(20) NOT NULL,
                        version VARCHAR(10) DEFAULT '1.0',
                        title VARCHAR(1000),
                        author_name VARCHAR(255),
                        author_url VARCHAR(2048),
                        provider_name VARCHAR(255),
                        provider_url VARCHAR(2048),
                        cache_age INTEGER,
                        thumbnail_url VARCHAR(2048),
                        thumbnail_width INTEGER,
                        thumbnail_height INTEGER,
                        content_url VARCHAR(2048),
                        width INTEGER,
                        height INTEGER,
                        html TEXT,
                        platform VARCHAR(50),
                        platform_id VARCHAR(255),
                        description TEXT,
                        duration INTEGER,
                        view_count INTEGER,
                        like_count INTEGER,
                        comment_count INTEGER,
                        share_count INTEGER,
                        published_at DATETIME,
                        local_thumbnail_path VARCHAR(1024),
                        local_content_path VARCHAR(1024),
                        extraction_status VARCHAR(20) DEFAULT 'pending',
                        extraction_error TEXT,
                        last_updated DATETIME,
                        raw_oembed_data JSON DEFAULT '{}',
                        platform_metadata JSON DEFAULT '{}',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (share_item_id) REFERENCES share_items(id) ON DELETE CASCADE
                    )
                """))
                logger.info("Created oembed_data table")

            if not oembed_cache_exists:
                # Create oembed_cache table
                await conn.execute(text("""
                    CREATE TABLE oembed_cache (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        url_hash VARCHAR(64) NOT NULL UNIQUE,
                        original_url VARCHAR(2048) NOT NULL,
                        oembed_response JSON NOT NULL,
                        status_code INTEGER NOT NULL,
                        cache_key VARCHAR(255),
                        platform VARCHAR(50),
                        expires_at DATETIME NOT NULL,
                        hit_count INTEGER DEFAULT 0,
                        last_hit DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))

                # Create index on url_hash for fast lookups
                await conn.execute(text(
                    "CREATE INDEX idx_oembed_cache_url_hash ON oembed_cache(url_hash)"
                ))

                # Create index on expires_at for cleanup
                await conn.execute(text(
                    "CREATE INDEX idx_oembed_cache_expires_at ON oembed_cache(expires_at)"
                ))

                logger.info("Created oembed_cache table with indexes")

            await conn.commit()

    except Exception as e:
        logger.error(f"Error creating oEmbed tables: {e}")
        raise

async def migrate_existing_urls():
    """Mark existing share items with URLs for oEmbed processing"""
    try:
        async with AsyncSessionLocal() as session:
            # Find all share items that have URLs but haven't been processed for oEmbed
            try:
                result = await session.execute(text("""
                    UPDATE share_items
                    SET oembed_processed = FALSE
                    WHERE url IS NOT NULL
                    AND url != ''
                    AND (oembed_processed IS NULL OR oembed_processed = FALSE)
                """))

                updated_count = result.rowcount
                await session.commit()

                logger.info(f"Marked {updated_count} existing share items for oEmbed processing")
            except Exception as e:
                logger.warning(f"Could not update existing share items (table may not exist yet): {e}")
                updated_count = 0

    except Exception as e:
        logger.error(f"Error migrating existing URLs: {e}")
        raise

async def run_migration():
    """Run the complete oEmbed migration"""
    logger.info("Starting oEmbed migration...")

    try:
        # Step 1: Add columns to existing share_items table
        logger.info("Step 1: Adding oEmbed columns to share_items...")
        await add_oembed_columns_to_share_items()

        # Step 2: Create new oEmbed tables
        logger.info("Step 2: Creating oEmbed tables...")
        await create_oembed_tables()

        # Step 3: Mark existing URLs for processing
        logger.info("Step 3: Marking existing URLs for oEmbed processing...")
        await migrate_existing_urls()

        logger.info("oEmbed migration completed successfully!")
        return True

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False

async def rollback_migration():
    """Rollback the oEmbed migration (for development/testing)"""
    logger.warning("Rolling back oEmbed migration...")

    try:
        async with engine.begin() as conn:
            # Drop oEmbed tables
            try:
                await conn.execute(text("DROP TABLE IF EXISTS oembed_data"))
                await conn.execute(text("DROP TABLE IF EXISTS oembed_cache"))
                logger.info("Dropped oEmbed tables")
            except Exception as e:
                logger.warning(f"Error dropping tables: {e}")

            # Remove columns from share_items (SQLite doesn't support DROP COLUMN easily)
            # For SQLite, we'd need to recreate the table, so we'll just log a warning
            logger.warning("Note: oEmbed columns in share_items table were not removed (SQLite limitation)")
            logger.warning("To fully rollback, you may need to recreate the database")

            await conn.commit()

        logger.info("Migration rollback completed")
        return True

    except Exception as e:
        logger.error(f"Rollback failed: {e}")
        return False

def main():
    """Main function to run migration from command line"""
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        success = asyncio.run(rollback_migration())
    else:
        success = asyncio.run(run_migration())

    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
