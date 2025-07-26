# Digital Wall Mobile App

React Native cross-platform mobile application with native share extension support for iOS and Android.

## Features

- **Native Share Integration**: Receive shared content from any app through native share menus
- **iOS Share Extension**: Custom Action Extension for processing shared content
- **Android Share Intents**: Intent filters to handle share actions from other apps
- **Cross-Platform**: Single codebase for both iOS and Android
- **Real-time Sync**: Shared content appears instantly in your digital wall
- **Offline Support**: Cache walls and sync when connection is available

## Prerequisites

- Node.js 18+ and npm/yarn
- React Native CLI
- For iOS: Xcode 14+, iOS Simulator
- For Android: Android Studio, Android SDK

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install iOS CocoaPods (iOS only):
```bash
cd ios && pod install
```

3. Start Metro bundler:
```bash
npm start
```

4. Run on device/simulator:
```bash
# iOS
npm run ios

# Android  
npm run android
```

## Architecture

### Share Flow

1. **User shares content** from any app (Safari, Twitter, etc.)
2. **Native share extension** receives the data
3. **React Native bridge** processes the content
4. **API call** sends data to Digital Wall backend
5. **Success feedback** shows confirmation to user
6. **Wall updates** reflect the new content

### Platform Implementations

#### iOS Share Extension
- Located in `ios/DigitalWallShare/`
- Implements Action Extension for iOS share sheet
- Processes URLs, text, and files
- Communicates with React Native via native modules

#### Android Share Intents
- Intent filters in `AndroidManifest.xml`
- ShareModule handles incoming share data
- Background service for content upload
- Native module bridge to React Native

### API Integration

The mobile app communicates with the Digital Wall backend API:

```typescript
// Share endpoint
POST /api/share
Content-Type: multipart/form-data

{
  title?: string,
  text?: string,
  url?: string,
  user_id: string
}
```

## Development

### Adding New Share Types

1. Update `ShareService.ts` with new data types
2. Modify native modules (iOS/Android) to handle new content
3. Update API calls to include new fields
4. Test on both platforms

### Testing Share Extensions

#### iOS Testing
1. Build and run on device/simulator
2. Open Safari and share a webpage
3. Select "Digital Wall" from share sheet
4. Verify content appears in the app

#### Android Testing  
1. Build and install APK
2. Open any app with share functionality
3. Select "Digital Wall" from share menu
4. Confirm content is processed correctly

## Deployment

### iOS App Store
1. Configure code signing in Xcode
2. Archive and validate app
3. Submit through App Store Connect
4. Include share extension in submission

### Android Play Store
1. Generate signed APK/AAB
2. Upload to Play Console
3. Configure store listing
4. Submit for review

## Troubleshooting

### Common Issues

**Share extension not appearing**
- Check iOS deployment target (11.0+)
- Verify extension bundle ID is configured
- Ensure share extension is included in build

**Android share not working**
- Verify intent filters in manifest
- Check package name matches
- Test on different Android versions

**API connection failures**  
- Use `10.0.2.2:8000` for Android emulator
- Use device IP for physical devices
- Ensure backend is running and accessible

## Configuration

### Environment Variables
- `API_BASE_URL`: Backend API endpoint
- `DEBUG_MODE`: Enable additional logging
- `USER_AGENT`: Custom user agent for API calls

### Build Configuration
- iOS: Configure in `ios/DigitalWallMobile.xcworkspace`
- Android: Modify `android/app/build.gradle`
- Metro: Configure in `metro.config.js`