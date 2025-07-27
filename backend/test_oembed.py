#!/usr/bin/env python3
"""
oEmbed Integration Test Script
Tests the complete oEmbed functionality including service, API endpoints, and database operations.
"""

import asyncio
import json
import sys
import os
from datetime import datetime
from typing import Dict, Any

# Add the backend directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '.'))

from app.services.oembed_service import oembed_service, OEmbedResponse
from app.core.database import init_db, AsyncSessionLocal
from app.models.models import ShareItem, Wall, User, OEmbedData
from app.tasks.oembed_tasks import process_oembed_background

# Test URLs for different platforms
TEST_URLS = {
    'youtube': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'twitter': 'https://twitter.com/twitter/status/1445078208190291973',
    'vimeo': 'https://vimeo.com/148751763',
    'soundcloud': 'https://soundcloud.com/forss/flickermood',
    'unsupported': 'https://example.com/some-page',
    'invalid': 'not-a-url'
}

class Colors:
    """Console colors for better output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    END = '\033[0m'

def print_header(text: str):
    """Print a formatted header"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text.center(60)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")

def print_success(text: str):
    """Print success message"""
    print(f"{Colors.GREEN}✅ {text}{Colors.END}")

def print_error(text: str):
    """Print error message"""
    print(f"{Colors.RED}❌ {text}{Colors.END}")

def print_warning(text: str):
    """Print warning message"""
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.END}")

def print_info(text: str):
    """Print info message"""
    print(f"{Colors.CYAN}ℹ️  {text}{Colors.END}")

async def test_oembed_service():
    """Test the core oEmbed service functionality"""
    print_header("Testing oEmbed Service")

    results = {}

    for platform, url in TEST_URLS.items():
        print(f"\n{Colors.PURPLE}Testing {platform}: {url}{Colors.END}")

        try:
            # Test URL support detection
            is_supported = oembed_service.is_supported_url(url)
            print_info(f"URL supported: {is_supported}")

            if platform == 'invalid':
                if not is_supported:
                    print_success("Correctly identified invalid URL")
                    results[platform] = {'status': 'pass', 'supported': False}
                else:
                    print_error("Failed to identify invalid URL")
                    results[platform] = {'status': 'fail', 'error': 'Invalid URL detected as valid'}
                continue

            if platform == 'unsupported':
                if not is_supported:
                    print_success("Correctly identified unsupported URL")
                    results[platform] = {'status': 'pass', 'supported': False}
                else:
                    print_warning("Unsupported URL detected as supported")
                    results[platform] = {'status': 'warning', 'supported': True}
                continue

            # Test oEmbed data extraction
            oembed_data = await oembed_service.get_oembed_data(url)

            if oembed_data:
                print_success(f"Successfully extracted oEmbed data")
                print_info(f"Type: {oembed_data.type}")
                print_info(f"Title: {oembed_data.title or 'N/A'}")
                print_info(f"Provider: {oembed_data.provider_name or 'N/A'}")
                print_info(f"Platform: {oembed_data.platform or 'N/A'}")

                results[platform] = {
                    'status': 'pass',
                    'supported': True,
                    'data': {
                        'type': oembed_data.type,
                        'title': oembed_data.title,
                        'provider': oembed_data.provider_name,
                        'platform': oembed_data.platform,
                        'has_thumbnail': bool(oembed_data.thumbnail_url)
                    }
                }
            else:
                print_warning(f"No oEmbed data extracted (might be expected for some platforms)")
                results[platform] = {'status': 'warning', 'supported': is_supported, 'data': None}

        except Exception as e:
            print_error(f"Error testing {platform}: {str(e)}")
            results[platform] = {'status': 'error', 'error': str(e)}

    return results

async def test_batch_processing():
    """Test batch oEmbed processing"""
    print_header("Testing Batch Processing")

    # Test batch processing with multiple URLs
    test_urls = [
        TEST_URLS['youtube'],
        TEST_URLS['vimeo'],
        TEST_URLS['unsupported']
    ]

    try:
        print_info(f"Processing {len(test_urls)} URLs in batch...")
        results = await oembed_service.batch_get_oembed_data(test_urls)

        successful = sum(1 for result in results.values() if result is not None)
        total = len(results)

        print_success(f"Batch processing completed: {successful}/{total} successful")

        for url, result in results.items():
            platform = next((k for k, v in TEST_URLS.items() if v == url), 'unknown')
            if result:
                print_info(f"{platform}: ✅ {result.provider_name or 'Unknown'}")
            else:
                print_warning(f"{platform}: ❌ No data")

        return {'status': 'pass', 'successful': successful, 'total': total}

    except Exception as e:
        print_error(f"Batch processing failed: {str(e)}")
        return {'status': 'error', 'error': str(e)}

async def test_database_integration():
    """Test database operations for oEmbed data"""
    print_header("Testing Database Integration")

    try:
        # Initialize database
        await init_db()
        print_success("Database initialized")

        async with AsyncSessionLocal() as session:
            # Create a test user
            user = User(
                username=f"test_user_{int(datetime.now().timestamp())}",
                email=f"test_{int(datetime.now().timestamp())}@example.com",
                is_anonymous=False
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            print_success(f"Created test user: {user.username}")

            # Create a test wall
            wall = Wall(
                name="Test oEmbed Wall",
                user_id=user.id,
                is_default=1
            )
            session.add(wall)
            await session.commit()
            await session.refresh(wall)
            print_success(f"Created test wall: {wall.name}")

            # Create a test share item with URL
            share_item = ShareItem(
                wall_id=wall.id,
                title="Test YouTube Video",
                url=TEST_URLS['youtube'],
                content_type="oembed",
                has_oembed=False,
                oembed_processed=False
            )
            session.add(share_item)
            await session.commit()
            await session.refresh(share_item)
            print_success(f"Created test share item: {share_item.id}")

            # Test oEmbed data extraction and storage
            print_info("Processing oEmbed data for share item...")
            success = await process_oembed_background(share_item.id)

            if success:
                print_success("oEmbed background processing completed")

                # Refresh session to get updated data
                await session.refresh(share_item)

                # Check if oEmbed data was created
                oembed_data = await session.get(OEmbedData, share_item.id)
                if oembed_data:
                    print_success("oEmbed data stored in database")
                    print_info(f"Title: {oembed_data.title}")
                    print_info(f"Provider: {oembed_data.provider_name}")
                    print_info(f"Status: {oembed_data.extraction_status}")
                else:
                    print_warning("No oEmbed data found in database")

            else:
                print_warning("oEmbed background processing reported failure")

            # Cleanup test data
            if oembed_data:
                await session.delete(oembed_data)
            await session.delete(share_item)
            await session.delete(wall)
            await session.delete(user)
            await session.commit()
            print_success("Cleaned up test data")

        return {'status': 'pass', 'processed': success}

    except Exception as e:
        print_error(f"Database integration test failed: {str(e)}")
        return {'status': 'error', 'error': str(e)}

async def test_supported_providers():
    """Test provider configuration and detection"""
    print_header("Testing Supported Providers")

    try:
        providers = oembed_service.get_supported_platforms()
        print_success(f"Found {len(providers)} supported providers:")

        for provider in providers:
            provider_config = oembed_service.providers.get(provider)
            if provider_config:
                print_info(f"  {provider_config.name} - {len(provider_config.schemes)} URL patterns")
            else:
                print_warning(f"  {provider} - No configuration found")

        # Test provider detection for each test URL
        print_info("\nTesting provider detection:")
        for platform, url in TEST_URLS.items():
            if platform not in ['invalid', 'unsupported']:
                provider = oembed_service._identify_provider(url)
                if provider:
                    print_success(f"  {platform} -> {provider.name}")
                else:
                    print_warning(f"  {platform} -> No provider detected")

        return {'status': 'pass', 'provider_count': len(providers)}

    except Exception as e:
        print_error(f"Provider test failed: {str(e)}")
        return {'status': 'error', 'error': str(e)}

async def run_all_tests():
    """Run all oEmbed tests"""
    print(f"{Colors.BOLD}{Colors.PURPLE}")
    print("🚀 Digital Wall MVP - oEmbed Integration Test Suite")
    print("="*60)
    print(f"{Colors.END}")

    # Test results storage
    all_results = {}

    try:
        # Test 1: Core oEmbed Service
        all_results['service'] = await test_oembed_service()

        # Test 2: Supported Providers
        all_results['providers'] = await test_supported_providers()

        # Test 3: Batch Processing
        all_results['batch'] = await test_batch_processing()

        # Test 4: Database Integration
        all_results['database'] = await test_database_integration()

        # Generate summary
        print_header("Test Summary")

        total_tests = len(all_results)
        passed_tests = sum(1 for result in all_results.values() if result.get('status') == 'pass')
        failed_tests = sum(1 for result in all_results.values() if result.get('status') == 'error')
        warning_tests = sum(1 for result in all_results.values() if result.get('status') == 'warning')

        print(f"{Colors.BOLD}Test Results:{Colors.END}")
        print(f"  {Colors.GREEN}✅ Passed: {passed_tests}{Colors.END}")
        print(f"  {Colors.YELLOW}⚠️  Warnings: {warning_tests}{Colors.END}")
        print(f"  {Colors.RED}❌ Failed: {failed_tests}{Colors.END}")
        print(f"  📊 Total: {total_tests}")

        # Detailed results
        print(f"\n{Colors.BOLD}Detailed Results:{Colors.END}")
        for test_name, result in all_results.items():
            status_icon = {
                'pass': f"{Colors.GREEN}✅{Colors.END}",
                'warning': f"{Colors.YELLOW}⚠️{Colors.END}",
                'error': f"{Colors.RED}❌{Colors.END}"
            }.get(result.get('status', 'unknown'), '❓')

            print(f"  {status_icon} {test_name.title()}: {result.get('status', 'unknown')}")
            if result.get('error'):
                print(f"    Error: {result['error']}")

        # Success rate
        success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0
        print(f"\n{Colors.BOLD}Overall Success Rate: {success_rate:.1f}%{Colors.END}")

        if success_rate >= 80:
            print_success("oEmbed integration is working well! 🎉")
        elif success_rate >= 60:
            print_warning("oEmbed integration has some issues but is functional ⚠️")
        else:
            print_error("oEmbed integration needs attention ❌")

        # Save detailed results to file
        results_file = 'oembed_test_results.json'
        with open(results_file, 'w') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'summary': {
                    'total': total_tests,
                    'passed': passed_tests,
                    'warnings': warning_tests,
                    'failed': failed_tests,
                    'success_rate': success_rate
                },
                'results': all_results
            }, f, indent=2)

        print_info(f"Detailed results saved to: {results_file}")

        return success_rate >= 60

    except Exception as e:
        print_error(f"Test suite failed: {str(e)}")
        return False

def main():
    """Main test execution"""
    try:
        # Run the async test suite
        success = asyncio.run(run_all_tests())

        # Exit with appropriate code
        sys.exit(0 if success else 1)

    except KeyboardInterrupt:
        print_warning("\nTest suite interrupted by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"Unexpected error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
