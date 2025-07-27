# Ngrok Configuration Guide

## Current Configuration
- **Active Tunnel URL**: `https://57891c1e054a.ngrok-free.app`
- **Backend API**: Port 8000 (Docker backend container)
- **Frontend**: Port 3000 (Docker frontend container)

## Quick URL Update Process

When ngrok tunnel changes, update these files:

### 1. Mobile App Configuration (Centralized)
**Primary File**: `/mobile/src/config/environment.ts`
```typescript
export const NGROK_BASE_URL = 'https://NEW_TUNNEL_URL.ngrok-free.app';
```

### 2. iOS Share Extension
**File**: `/mobile/ios/DigitalWallShare/ShareViewController.swift`
```swift
private let API_BASE_URL = "https://NEW_TUNNEL_URL.ngrok-free.app"
```

### 3. iOS Headers (line ~155)
```swift
request.setValue("https://NEW_TUNNEL_URL.ngrok-free.app", forHTTPHeaderField: "ngrok-skip-browser-warning")
```

## Updated Files (✅ Completed)
- ✅ `/mobile/src/config/environment.ts` - Centralized configuration
- ✅ `/mobile/src/services/ShareService.ts` - Uses ENV_CONFIG
- ✅ `/mobile/src/services/EnhancedShareService.ts` - Uses ENV_CONFIG  
- ✅ `/mobile/src/services/CrossPlatformShareService.ts` - Uses ENV_CONFIG
- ✅ `/mobile/src/screens/WallScreen.tsx` - Uses ENV_CONFIG
- ✅ `/mobile/ios/DigitalWallShare/ShareViewController.swift` - Updated URLs

## Backend Testing
**oEmbed API Test**:
```bash
curl -X POST "https://NEW_TUNNEL_URL.ngrok-free.app/api/oembed/preview" \
  -H "Content-Type: application/json" \
  -H "ngrok-skip-browser-warning: true" \
  -d '{"url": "https://x.com/jesx64/status/1948994904354406620"}'
```

**Expected Response**: `{"is_supported": true, "oembed_data": {...}}`

## Frontend Features Fixed
- ✅ Floating Action Button (no more intrusive form)
- ✅ oEmbed validation working (`/api/oembed/preview`)
- ✅ Clean modal UX for adding content
- ✅ Centralized URL configuration

## Notes
- Environment config automatically switches between dev (ngrok) and production URLs
- All React Native services now import from centralized config
- iOS Share Extension still needs manual updates (2 lines only)