# [[React Native Cross-Platform]] - Mobile Architecture

## Overview & Core Concepts

**React Native** provides a unified development platform for the [[Digital Wall]] mobile app, enabling code sharing between iOS and Android while maintaining native performance and platform-specific integrations. This document covers advanced React Native patterns, native module integration, and cross-platform architecture for seamless sharing functionality.

### Cross-Platform Architecture Components
- **[[Shared Business Logic]]**: Common state management and data handling
- **[[Platform-Specific Modules]]**: Native integrations for iOS and Android sharing
- **[[Bridge Communication]]**: JavaScript to native code interaction
- **[[Code Splitting]]**: Platform-optimized bundle management
- **[[Native UI Components]]**: Custom native components for optimal performance

## Technical Deep Dive

### Project Structure and Configuration

```javascript
// metro.config.js - Metro bundler configuration for cross-platform
const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
  const {
    resolver: { sourceExts, assetExts },
  } = await getDefaultConfig();

  return {
    transformer: {
      babelTransformerPath: require.resolve('react-native-svg-transformer'),
    },
    resolver: {
      assetExts: assetExts.filter((ext) => ext !== 'svg'),
      sourceExts: [...sourceExts, 'svg'],
      platforms: ['ios', 'android', 'native', 'web'],
    },
    serializer: {
      // Platform-specific bundle optimization
      createModuleIdFactory: () => (path) => {
        let name = path.substr(path.lastIndexOf('/') + 1);
        if (name.endsWith('.js')) {
          name = name.substr(0, name.length - 3);
        }
        return name;
      },
    },
  };
})();
```

```json
// package.json - Cross-platform dependencies
{
  "name": "digital-wall-mobile",
  "version": "1.0.0",
  "scripts": {
    "ios": "react-native run-ios",
    "android": "react-native run-android",
    "start": "react-native start",
    "test": "jest",
    "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
    "build:ios": "cd ios && xcodebuild -workspace DigitalWall.xcworkspace -scheme DigitalWall -configuration Release -sdk iphoneos build",
    "build:android": "cd android && ./gradlew assembleRelease",
    "bundle:ios": "react-native bundle --platform ios --dev false --entry-file index.js --bundle-output ios/main.jsbundle",
    "bundle:android": "react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle"
  },
  "dependencies": {
    "react-native": "0.72.0",
    "@react-native-async-storage/async-storage": "^1.19.0",
    "@react-navigation/native": "^6.1.0",
    "@react-navigation/stack": "^6.3.0",
    "@reduxjs/toolkit": "^1.9.0",
    "react-redux": "^8.1.0",
    "react-native-fast-image": "^8.6.0",
    "react-native-gesture-handler": "^2.12.0",
    "react-native-reanimated": "^3.3.0",
    "react-native-safe-area-context": "^4.7.0",
    "react-native-screens": "^3.22.0",
    "react-native-vector-icons": "^10.0.0",
    "react-native-share": "^9.4.0",
    "react-native-image-picker": "^5.6.0",
    "react-native-document-picker": "^9.0.0",
    "react-native-permissions": "^3.8.0",
    "@react-native-community/netinfo": "^9.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-native": "^0.72.0",
    "typescript": "^5.1.0",
    "jest": "^29.5.0",
    "metro-react-native-babel-preset": "^0.76.0"
  }
}
```

### Shared Business Logic Layer

```typescript
// src/store/slices/contentSlice.ts - Redux Toolkit slice for content management
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ContentItem, ShareContentRequest, ProcessingStatus } from '../types';
import { ApiService } from '../services/ApiService';
import { ShareService } from '../services/ShareService';

interface ContentState {
  items: ContentItem[];
  processing: Record<string, ProcessingStatus>;
  isLoading: boolean;
  error: string | null;
  shareQueue: ShareContentRequest[];
}

const initialState: ContentState = {
  items: [],
  processing: {},
  isLoading: false,
  error: null,
  shareQueue: [],
};

// Async thunks for cross-platform operations
export const shareContent = createAsyncThunk(
  'content/shareContent',
  async (shareRequest: ShareContentRequest, { dispatch, rejectWithValue }) => {
    try {
      // Platform-agnostic sharing logic
      const processingId = ShareService.generateProcessingId();
      
      // Update processing status
      dispatch(updateProcessingStatus({ 
        id: processingId, 
        status: { stage: 'validating', progress: 10 } 
      }));

      // Validate content
      const validation = await ShareService.validateContent(shareRequest);
      if (!validation.isValid) {
        throw new Error(validation.errorMessage);
      }

      // Queue for processing
      dispatch(addToShareQueue(shareRequest));
      
      // Process content
      const result = await ApiService.processSharedContent(shareRequest);
      
      // Update processing status
      dispatch(updateProcessingStatus({ 
        id: processingId, 
        status: { stage: 'completed', progress: 100, result } 
      }));

      return result;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchUserContent = createAsyncThunk(
  'content/fetchUserContent',
  async (params: { page?: number; filter?: string }, { rejectWithValue }) => {
    try {
      const response = await ApiService.getUserContent(params);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    addToShareQueue: (state, action: PayloadAction<ShareContentRequest>) => {
      state.shareQueue.push(action.payload);
    },
    removeFromShareQueue: (state, action: PayloadAction<string>) => {
      state.shareQueue = state.shareQueue.filter(item => item.id !== action.payload);
    },
    updateProcessingStatus: (
      state, 
      action: PayloadAction<{ id: string; status: ProcessingStatus }>
    ) => {
      state.processing[action.payload.id] = action.payload.status;
    },
    clearProcessingStatus: (state, action: PayloadAction<string>) => {
      delete state.processing[action.payload];
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Share content
      .addCase(shareContent.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(shareContent.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items.unshift(action.payload);
        // Remove from queue
        state.shareQueue = state.shareQueue.filter(
          item => item.id !== action.payload.id
        );
      })
      .addCase(shareContent.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fetch content
      .addCase(fetchUserContent.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchUserContent.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload;
      })
      .addCase(fetchUserContent.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  addToShareQueue,
  removeFromShareQueue,
  updateProcessingStatus,
  clearProcessingStatus,
  clearError
} = contentSlice.actions;

export default contentSlice.reducer;
```

### Cross-Platform Share Service

```typescript
// src/services/ShareService.ts - Platform-agnostic sharing logic
import { Platform } from 'react-native';
import { ShareContentRequest, ValidationResult, ProcessingStatus } from '../types';
import { IOSShareModule } from '../native/ios/IOSShareModule';
import { AndroidShareModule } from '../native/android/AndroidShareModule';

export class ShareService {
  private static instance: ShareService;
  
  static getInstance(): ShareService {
    if (!ShareService.instance) {
      ShareService.instance = new ShareService();
    }
    return ShareService.instance;
  }

  async shareContent(request: ShareContentRequest): Promise<string> {
    const validation = await this.validateContent(request);
    if (!validation.isValid) {
      throw new Error(validation.errorMessage);
    }

    // Use platform-specific sharing logic
    if (Platform.OS === 'ios') {
      return IOSShareModule.processShare(request);
    } else if (Platform.OS === 'android') {
      return AndroidShareModule.processShare(request);
    } else {
      throw new Error('Platform not supported');
    }
  }

  async validateContent(request: ShareContentRequest): Promise<ValidationResult> {
    const validations = [
      this.validateContentType(request),
      this.validateContentSize(request),
      this.validatePermissions(request),
      await this.validateNetworkAccess()
    ];

    const failedValidation = validations.find(v => !v.isValid);
    if (failedValidation) {
      return failedValidation;
    }

    return { isValid: true };
  }

  private validateContentType(request: ShareContentRequest): ValidationResult {
    const supportedTypes = ['text', 'url', 'image', 'video', 'file'];
    
    if (!supportedTypes.includes(request.contentType)) {
      return {
        isValid: false,
        errorMessage: `Unsupported content type: ${request.contentType}`
      };
    }

    return { isValid: true };
  }

  private validateContentSize(request: ShareContentRequest): ValidationResult {
    const maxSizes = {
      text: 10000, // 10KB
      url: 2000,   // 2KB
      image: 50 * 1024 * 1024, // 50MB
      video: 100 * 1024 * 1024, // 100MB
      file: 50 * 1024 * 1024    // 50MB
    };

    const maxSize = maxSizes[request.contentType as keyof typeof maxSizes];
    const contentSize = this.getContentSize(request);

    if (contentSize > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      return {
        isValid: false,
        errorMessage: `Content too large. Maximum size: ${maxSizeMB}MB`
      };
    }

    return { isValid: true };
  }

  private validatePermissions(request: ShareContentRequest): ValidationResult {
    // Platform-specific permission validation
    if (Platform.OS === 'ios') {
      return IOSShareModule.validatePermissions(request);
    } else if (Platform.OS === 'android') {
      return AndroidShareModule.validatePermissions(request);
    }

    return { isValid: true };
  }

  private async validateNetworkAccess(): Promise<ValidationResult> {
    try {
      const NetInfo = require('@react-native-community/netinfo').default;
      const netState = await NetInfo.fetch();

      if (!netState.isConnected) {
        return {
          isValid: false,
          errorMessage: 'No internet connection available'
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        errorMessage: 'Unable to check network status'
      };
    }
  }

  private getContentSize(request: ShareContentRequest): number {
    switch (request.contentType) {
      case 'text':
        return (request.content?.length || 0) * 2; // UTF-8 estimation
      case 'url':
        return (request.url?.length || 0) * 2;
      case 'image':
      case 'video':
      case 'file':
        return request.fileSize || 0;
      default:
        return 0;
    }
  }

  static generateProcessingId(): string {
    return `process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Real-time processing status updates
  async trackProcessingStatus(
    processingId: string,
    onUpdate: (status: ProcessingStatus) => void
  ): Promise<void> {
    // Platform-specific status tracking
    if (Platform.OS === 'ios') {
      return IOSShareModule.trackProcessing(processingId, onUpdate);
    } else if (Platform.OS === 'android') {
      return AndroidShareModule.trackProcessing(processingId, onUpdate);
    }
  }
}

export default ShareService;
```

### Native Module Integration - iOS

```typescript
// src/native/ios/IOSShareModule.ts - iOS-specific native module
import { NativeModules, NativeEventEmitter } from 'react-native';
import { ShareContentRequest, ValidationResult, ProcessingStatus } from '../../types';

interface IOSShareModuleInterface {
  processShare(request: ShareContentRequest): Promise<string>;
  validatePermissions(request: ShareContentRequest): ValidationResult;
  trackProcessing(processingId: string, callback: (status: ProcessingStatus) => void): void;
}

// Type definition for native iOS module
const IOSShareNative = NativeModules.IOSShareModule;
const IOSShareEmitter = new NativeEventEmitter(IOSShareNative);

export class IOSShareModule implements IOSShareModuleInterface {
  
  static async processShare(request: ShareContentRequest): Promise<string> {
    try {
      // Call native iOS method
      const result = await IOSShareNative.processShareContent({
        contentType: request.contentType,
        content: request.content,
        url: request.url,
        fileUri: request.fileUri,
        fileName: request.fileName,
        mimeType: request.mimeType,
        metadata: request.metadata
      });

      return result.processingId;
    } catch (error: any) {
      throw new Error(`iOS share processing failed: ${error.message}`);
    }
  }

  static validatePermissions(request: ShareContentRequest): ValidationResult {
    // Check iOS-specific permissions
    const requiredPermissions = [];

    if (request.contentType === 'image' || request.contentType === 'video') {
      requiredPermissions.push('photos');
    }

    if (request.contentType === 'file') {
      requiredPermissions.push('documents');
    }

    // Native permission check
    const hasPermissions = IOSShareNative.checkPermissions(requiredPermissions);
    
    if (!hasPermissions) {
      return {
        isValid: false,
        errorMessage: 'Required permissions not granted. Please enable in Settings.'
      };
    }

    return { isValid: true };
  }

  static trackProcessing(
    processingId: string,
    onUpdate: (status: ProcessingStatus) => void
  ): void {
    // Subscribe to native processing updates
    const subscription = IOSShareEmitter.addListener(
      'ShareProcessingUpdate',
      (event) => {
        if (event.processingId === processingId) {
          onUpdate({
            stage: event.stage,
            progress: event.progress,
            message: event.message,
            error: event.error
          });

          // Clean up subscription when completed
          if (event.stage === 'completed' || event.stage === 'failed') {
            subscription.remove();
          }
        }
      }
    );

    // Start tracking
    IOSShareNative.startProcessingTracking(processingId);
  }

  static async requestPermissions(): Promise<boolean> {
    try {
      return await IOSShareNative.requestSharePermissions();
    } catch (error) {
      return false;
    }
  }
}
```

```objc
// ios/DigitalWall/IOSShareModule.m - Native iOS implementation
#import "IOSShareModule.h"
#import <React/RCTLog.h>
#import <Photos/Photos.h>
#import <AVFoundation/AVFoundation.h>

@implementation IOSShareModule

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"ShareProcessingUpdate"];
}

RCT_EXPORT_METHOD(processShareContent:(NSDictionary *)request
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      NSString *contentType = request[@"contentType"];
      NSString *processingId = [[NSUUID UUID] UUIDString];
      
      // Create shared content object
      SharedContent *sharedContent = [[SharedContent alloc] init];
      sharedContent.contentType = contentType;
      sharedContent.processingId = processingId;
      
      if ([contentType isEqualToString:@"text"]) {
        sharedContent.textContent = request[@"content"];
      } else if ([contentType isEqualToString:@"url"]) {
        sharedContent.url = [NSURL URLWithString:request[@"url"]];
      } else if ([contentType isEqualToString:@"image"] || 
                 [contentType isEqualToString:@"video"] ||
                 [contentType isEqualToString:@"file"]) {
        sharedContent.fileUri = request[@"fileUri"];
        sharedContent.fileName = request[@"fileName"];
        sharedContent.mimeType = request[@"mimeType"];
      }
      
      // Process asynchronously
      [self processContentInBackground:sharedContent];
      
      resolve(@{@"processingId": processingId});
      
    } @catch (NSException *exception) {
      reject(@"processing_error", exception.reason, nil);
    }
  });
}

- (void)processContentInBackground:(SharedContent *)content {
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    
    // Emit processing start
    [self sendEventWithName:@"ShareProcessingUpdate" body:@{
      @"processingId": content.processingId,
      @"stage": @"validating",
      @"progress": @10,
      @"message": @"Validating content..."
    }];
    
    // Validate content
    NSError *validationError = [self validateSharedContent:content];
    if (validationError) {
      [self sendEventWithName:@"ShareProcessingUpdate" body:@{
        @"processingId": content.processingId,
        @"stage": @"failed",
        @"progress": @0,
        @"error": validationError.localizedDescription
      }];
      return;
    }
    
    // Upload content
    [self sendEventWithName:@"ShareProcessingUpdate" body:@{
      @"processingId": content.processingId,
      @"stage": @"uploading",
      @"progress": @50,
      @"message": @"Uploading content..."
    }];
    
    [self uploadContent:content completion:^(BOOL success, NSError *error) {
      if (success) {
        [self sendEventWithName:@"ShareProcessingUpdate" body:@{
          @"processingId": content.processingId,
          @"stage": @"completed",
          @"progress": @100,
          @"message": @"Content added to your Digital Wall!"
        }];
      } else {
        [self sendEventWithName:@"ShareProcessingUpdate" body:@{
          @"processingId": content.processingId,
          @"stage": @"failed",
          @"progress": @0,
          @"error": error.localizedDescription
        }];
      }
    }];
  });
}

RCT_EXPORT_METHOD(checkPermissions:(NSArray *)requiredPermissions
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  
  BOOL hasAllPermissions = YES;
  
  for (NSString *permission in requiredPermissions) {
    if ([permission isEqualToString:@"photos"]) {
      PHAuthorizationStatus status = [PHPhotoLibrary authorizationStatus];
      if (status != PHAuthorizationStatusAuthorized && 
          status != PHAuthorizationStatusLimited) {
        hasAllPermissions = NO;
        break;
      }
    } else if ([permission isEqualToString:@"documents"]) {
      // Check document access permissions
      // Implementation depends on specific requirements
    }
  }
  
  resolve(@(hasAllPermissions));
}

RCT_EXPORT_METHOD(requestSharePermissions:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  
  [PHPhotoLibrary requestAuthorization:^(PHAuthorizationStatus status) {
    dispatch_async(dispatch_get_main_queue(), ^{
      BOOL granted = (status == PHAuthorizationStatusAuthorized || 
                      status == PHAuthorizationStatusLimited);
      resolve(@(granted));
    });
  }];
}

- (NSError *)validateSharedContent:(SharedContent *)content {
  // Implement content validation logic
  if (!content.contentType) {
    return [NSError errorWithDomain:@"ValidationError" 
                               code:1001 
                           userInfo:@{NSLocalizedDescriptionKey: @"Content type is required"}];
  }
  
  // Add more validation as needed
  return nil;
}

- (void)uploadContent:(SharedContent *)content 
           completion:(void (^)(BOOL success, NSError *error))completion {
  
  // Implement actual upload logic
  // This would typically use NSURLSession to upload to your API
  
  NSURLSession *session = [NSURLSession sharedSession];
  NSURL *url = [NSURL URLWithString:@"https://api.digitalwall.app/v1/share"];
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  request.HTTPMethod = @"POST";
  
  // Prepare multipart form data
  NSString *boundary = [[NSUUID UUID] UUIDString];
  NSString *contentType = [NSString stringWithFormat:@"multipart/form-data; boundary=%@", boundary];
  [request setValue:contentType forHTTPHeaderField:@"Content-Type"];
  
  NSMutableData *body = [NSMutableData data];
  // Add form data based on content type
  
  NSURLSessionDataTask *task = [session uploadTaskWithRequest:request 
                                                     fromData:body 
                                            completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    if (error) {
      completion(NO, error);
    } else {
      NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
      BOOL success = (httpResponse.statusCode >= 200 && httpResponse.statusCode < 300);
      completion(success, success ? nil : [NSError errorWithDomain:@"UploadError" 
                                                              code:httpResponse.statusCode 
                                                          userInfo:nil]);
    }
  }];
  
  [task resume];
}

@end
```

### Cross-Platform UI Components

```typescript
// src/components/ShareProgressModal.tsx - Cross-platform progress modal
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ProcessingStatus } from '../types';

interface ShareProgressModalProps {
  visible: boolean;
  status: ProcessingStatus | null;
  onClose: () => void;
}

export const ShareProgressModal: React.FC<ShareProgressModalProps> = ({
  visible,
  status,
  onClose,
}) => {
  const [showSuccess, setShowSuccess] = useState(false);
  const progressWidth = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 300 });
      scale.value = withSpring(1, { damping: 15 });
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(0.8, { duration: 200 });
    }
  }, [visible]);

  useEffect(() => {
    if (status?.progress) {
      progressWidth.value = withTiming(status.progress, { duration: 500 });
    }

    if (status?.stage === 'completed') {
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
        setShowSuccess(false);
      }, 2000);
    }
  }, [status]);

  const animatedModalStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const getStatusColor = () => {
    if (status?.stage === 'failed') return '#FF6B6B';
    if (status?.stage === 'completed' || showSuccess) return '#4ECDC4';
    return '#3498DB';
  };

  const getStatusIcon = () => {
    if (status?.stage === 'failed') return '❌';
    if (status?.stage === 'completed' || showSuccess) return '✅';
    return null;
  };

  const getStatusMessage = () => {
    if (showSuccess) return 'Content added to your Digital Wall!';
    if (status?.error) return status.error;
    return status?.message || 'Processing...';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Animated.View style={[styles.modal, animatedModalStyle]}>
          <View style={styles.header}>
            <Text style={styles.title}>Sharing Content</Text>
          </View>

          <View style={styles.content}>
            {/* Status Icon */}
            {getStatusIcon() ? (
              <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
            ) : (
              <ActivityIndicator
                size="large"
                color={getStatusColor()}
                style={styles.loader}
              />
            )}

            {/* Status Message */}
            <Text style={[styles.message, { color: getStatusColor() }]}>
              {getStatusMessage()}
            </Text>

            {/* Progress Bar */}
            {status?.stage !== 'completed' && status?.stage !== 'failed' && (
              <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressBar,
                      { backgroundColor: getStatusColor() },
                      animatedProgressStyle,
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {status?.progress || 0}%
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: width * 0.85,
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    textAlign: 'center',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  loader: {
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#7F8C8D',
    fontWeight: '500',
  },
});
```

### Performance Optimization

```typescript
// src/utils/PerformanceOptimizer.ts - Cross-platform performance utilities
import { Platform, InteractionManager } from 'react-native';
import { Bundle, ComponentType } from 'react';

export class PerformanceOptimizer {
  
  // Lazy loading for heavy components
  static createLazyComponent<T>(
    importFunction: () => Promise<{ default: ComponentType<T> }>
  ): ComponentType<T> {
    return React.lazy(() => importFunction());
  }

  // Platform-specific bundle splitting
  static async loadPlatformBundle(bundleName: string): Promise<any> {
    const platformSuffix = Platform.OS;
    
    try {
      // Try platform-specific bundle first
      return await import(`../bundles/${bundleName}.${platformSuffix}.js`);
    } catch (error) {
      // Fall back to generic bundle
      return await import(`../bundles/${bundleName}.js`);
    }
  }

  // Interaction-aware task scheduling
  static scheduleAfterInteraction<T>(
    task: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      InteractionManager.runAfterInteractions(() => {
        task().then(resolve).catch(reject);
      });
    });
  }

  // Memory-efficient image loading
  static getOptimizedImageProps(
    imageUri: string,
    containerDimensions: { width: number; height: number }
  ) {
    const { width, height } = containerDimensions;
    const pixelRatio = Platform.OS === 'ios' ? 2 : 1.5; // iOS typically has higher DPI
    
    return {
      source: { uri: imageUri },
      style: { width, height },
      resizeMode: 'cover' as const,
      // Platform-specific optimizations
      ...(Platform.OS === 'android' ? {
        progressiveRenderingEnabled: true,
        shouldRasterizeIOS: false,
      } : {
        shouldRasterizeIOS: true,
      }),
      // Resize for optimal memory usage
      resize: {
        width: width * pixelRatio,
        height: height * pixelRatio,
      },
    };
  }

  // Network request optimization
  static optimizeNetworkRequest(
    request: RequestInit & { url: string }
  ): RequestInit & { url: string } {
    const optimized = { ...request };

    // Platform-specific headers
    if (Platform.OS === 'ios') {
      optimized.headers = {
        ...optimized.headers,
        'User-Agent': 'DigitalWall iOS App',
      };
    } else {
      optimized.headers = {
        ...optimized.headers,
        'User-Agent': 'DigitalWall Android App',
      };
    }

    // Request timeout optimization
    if (!optimized.signal) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 30000); // 30 second timeout
      optimized.signal = controller.signal;
    }

    return optimized;
  }

  // Memory pressure handling
  static handleMemoryPressure() {
    if (Platform.OS === 'ios') {
      // iOS memory warnings
      const { DeviceEventEmitter } = require('react-native');
      DeviceEventEmitter.addListener('memoryWarning', () => {
        // Clear image caches
        this.clearImageCache();
        // Trigger garbage collection
        global.gc?.();
      });
    }
  }

  private static clearImageCache() {
    // Clear FastImage cache
    const FastImage = require('react-native-fast-image');
    FastImage.clearMemoryCache();
    FastImage.clearDiskCache();
  }

  // Bundle size analysis (development only)
  static analyzeBundleSize() {
    if (__DEV__) {
      const bundleSize = require('react-native-bundle-visualizer');
      bundleSize.getBundleSize().then((size: number) => {
        console.log(`Bundle size: ${(size / 1024 / 1024).toFixed(2)}MB`);
      });
    }
  }
}

// Platform-specific configuration
export const PlatformConfig = {
  ios: {
    maxConcurrentUploads: 3,
    chunkSize: 1024 * 1024, // 1MB chunks
    timeout: 60000,
    retryAttempts: 3,
  },
  android: {
    maxConcurrentUploads: 2,
    chunkSize: 512 * 1024, // 512KB chunks  
    timeout: 45000,
    retryAttempts: 2,
  },
};

// Get platform-specific configuration
export function getPlatformConfig() {
  return PlatformConfig[Platform.OS as keyof typeof PlatformConfig] || PlatformConfig.android;
}
```

## Development Patterns

### Testing Cross-Platform Code

```typescript
// __tests__/ShareService.test.ts - Cross-platform testing
import { ShareService } from '../src/services/ShareService';
import { Platform } from 'react-native';

// Mock platform-specific modules
jest.mock('../src/native/ios/IOSShareModule', () => ({
  IOSShareModule: {
    processShare: jest.fn(),
    validatePermissions: jest.fn(),
    trackProcessing: jest.fn(),
  },
}));

jest.mock('../src/native/android/AndroidShareModule', () => ({
  AndroidShareModule: {
    processShare: jest.fn(),
    validatePermissions: jest.fn(),
    trackProcessing: jest.fn(),
  },
}));

describe('ShareService', () => {
  let shareService: ShareService;

  beforeEach(() => {
    shareService = ShareService.getInstance();
    jest.clearAllMocks();
  });

  describe('Cross-platform validation', () => {
    test('validates text content correctly', async () => {
      const request = {
        contentType: 'text',
        content: 'Test content',
        id: 'test-id',
      };

      const result = await shareService.validateContent(request);
      expect(result.isValid).toBe(true);
    });

    test('rejects oversized content', async () => {
      const request = {
        contentType: 'text',
        content: 'x'.repeat(15000), // Exceeds 10KB limit
        id: 'test-id',
      };

      const result = await shareService.validateContent(request);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('too large');
    });

    test('validates supported content types', async () => {
      const supportedTypes = ['text', 'url', 'image', 'video', 'file'];

      for (const contentType of supportedTypes) {
        const request = {
          contentType,
          content: 'test',
          id: 'test-id',
        };

        const result = await shareService.validateContent(request);
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe('Platform-specific behavior', () => {
    test('uses iOS module on iOS platform', async () => {
      Platform.OS = 'ios';
      
      const { IOSShareModule } = require('../src/native/ios/IOSShareModule');
      IOSShareModule.processShare.mockResolvedValue('processing-id');

      const request = {
        contentType: 'text',
        content: 'Test content',
        id: 'test-id',
      };

      await shareService.shareContent(request);

      expect(IOSShareModule.processShare).toHaveBeenCalledWith(request);
    });

    test('uses Android module on Android platform', async () => {
      Platform.OS = 'android';
      
      const { AndroidShareModule } = require('../src/native/android/AndroidShareModule');
      AndroidShareModule.processShare.mockResolvedValue('processing-id');

      const request = {
        contentType: 'text',
        content: 'Test content',
        id: 'test-id',
      };

      await shareService.shareContent(request);

      expect(AndroidShareModule.processShare).toHaveBeenCalledWith(request);
    });
  });

  describe('Error handling', () => {
    test('handles network unavailable gracefully', async () => {
      // Mock NetInfo to return disconnected state
      const NetInfo = require('@react-native-community/netinfo');
      NetInfo.default.fetch.mockResolvedValue({ isConnected: false });

      const request = {
        contentType: 'text',
        content: 'Test content',
        id: 'test-id',
      };

      const result = await shareService.validateContent(request);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('No internet connection');
    });

    test('throws error for unsupported platforms', async () => {
      Platform.OS = 'web'; // Unsupported platform

      const request = {
        contentType: 'text',
        content: 'Test content',
        id: 'test-id',
      };

      await expect(shareService.shareContent(request)).rejects.toThrow('Platform not supported');
    });
  });
});
```

### Build Configuration

```javascript
// scripts/build.js - Cross-platform build script
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const platform = process.argv[2]; // 'ios' or 'android'
const buildType = process.argv[3] || 'debug'; // 'debug' or 'release'

if (!platform || !['ios', 'android'].includes(platform)) {
  console.error('Usage: node build.js <ios|android> [debug|release]');
  process.exit(1);
}

console.log(`Building for ${platform} in ${buildType} mode...`);

// Platform-specific build configurations
const buildConfigs = {
  ios: {
    debug: {
      scheme: 'DigitalWall',
      configuration: 'Debug',
      destination: 'generic/platform=iOS Simulator',
    },
    release: {
      scheme: 'DigitalWall',
      configuration: 'Release',
      destination: 'generic/platform=iOS',
      archivePath: 'ios/build/DigitalWall.xcarchive',
      exportPath: 'ios/build/',
    },
  },
  android: {
    debug: {
      task: 'assembleDebug',
      outputPath: 'android/app/build/outputs/apk/debug/',
    },
    release: {
      task: 'assembleRelease',
      outputPath: 'android/app/build/outputs/apk/release/',
    },
  },
};

// Pre-build tasks
function preBuild() {
  console.log('Running pre-build tasks...');
  
  // Install dependencies
  execSync('npm install', { stdio: 'inherit' });
  
  // Generate platform-specific bundles
  const bundleCommand = `npx react-native bundle --platform ${platform} --dev ${buildType === 'debug'} --entry-file index.js --bundle-output ${platform}/bundle.${platform}.js`;
  execSync(bundleCommand, { stdio: 'inherit' });
  
  // Platform-specific pre-build
  if (platform === 'ios') {
    execSync('cd ios && pod install', { stdio: 'inherit' });
  }
}

// Build function
function build() {
  const config = buildConfigs[platform][buildType];
  
  if (platform === 'ios') {
    buildIOS(config);
  } else {
    buildAndroid(config);
  }
}

function buildIOS(config) {
  console.log('Building iOS app...');
  
  const buildCmd = [
    'cd ios &&',
    'xcodebuild',
    `-workspace DigitalWall.xcworkspace`,
    `-scheme ${config.scheme}`,
    `-configuration ${config.configuration}`,
    `-destination '${config.destination}'`,
  ].join(' ');
  
  if (buildType === 'release') {
    // Archive for release
    const archiveCmd = buildCmd + ` -archivePath ${config.archivePath} archive`;
    execSync(archiveCmd, { stdio: 'inherit' });
    
    // Export archive
    const exportCmd = [
      'cd ios &&',
      'xcodebuild',
      '-exportArchive',
      `-archivePath ${config.archivePath}`,
      `-exportPath ${config.exportPath}`,
      '-exportOptionsPlist exportOptions.plist'
    ].join(' ');
    execSync(exportCmd, { stdio: 'inherit' });
  } else {
    execSync(buildCmd + ' build', { stdio: 'inherit' });
  }
}

function buildAndroid(config) {
  console.log('Building Android app...');
  
  const buildCmd = `cd android && ./gradlew ${config.task}`;
  execSync(buildCmd, { stdio: 'inherit' });
  
  console.log(`APK generated at: ${config.outputPath}`);
}

// Post-build tasks
function postBuild() {
  console.log('Running post-build tasks...');
  
  // Generate build info
  const buildInfo = {
    platform,
    buildType,
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
    commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  };
  
  fs.writeFileSync('build-info.json', JSON.stringify(buildInfo, null, 2));
  
  console.log('Build completed successfully!');
  console.log('Build info:', buildInfo);
}

// Execute build pipeline
try {
  preBuild();
  build();
  postBuild();
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
```

## Integration Examples

### Complete React Native Architecture

```mermaid
graph TD
    A[React Native App] --> B[Shared Business Logic]
    B --> C[Redux Store]
    C --> D[Cross-Platform Services]
    
    subgraph "Platform Bridges"
        E[iOS Bridge]
        F[Android Bridge]
    end
    
    D --> E
    D --> F
    
    E --> G[iOS Share Extension]
    F --> H[Android Share Intent]
    
    subgraph "Native Modules"
        I[iOS Native Code]
        J[Android Native Code]
    end
    
    G --> I
    H --> J
    
    I --> K[[[FastAPI Async Architecture]]]
    J --> K
    K --> L[[[Content Processing Pipeline]]]
    
    subgraph "Cross-Platform UI"
        M[Shared Components]
        N[Platform-Specific Styles]
        O[Navigation]
    end
    
    A --> M
    M --> N
    M --> O
    
    subgraph "Performance Optimization"
        P[Bundle Splitting]
        Q[Lazy Loading]
        R[Memory Management]
    end
    
    B --> P
    D --> Q
    A --> R
```

### Integration with [[Digital Wall]] Components

- **[[iOS Share Extensions]]**: Native iOS integration through React Native bridge
- **[[Android Share Intents]]**: Native Android integration with shared business logic
- **[[PWA Share Target API]]**: Unified sharing experience across web and mobile
- **[[FastAPI Async Architecture]]**: Consistent API integration across platforms
- **[[Content Processing Pipeline]]**: Unified content processing for all platforms

## References & Further Reading

### Official Documentation
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [React Native Bridge Documentation](https://reactnative.dev/docs/native-modules-intro)
- [Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code)

### Performance and Architecture
- [React Native Performance](https://reactnative.dev/docs/performance)
- [React Native Architecture](https://reactnative.dev/architecture/overview)
- [Metro Bundler](https://metrobundler.dev/)

### Related [[Vault]] Concepts
- [[Mobile Development]] - Mobile app development fundamentals
- [[Cross-Platform Development]] - Multi-platform development strategies
- [[Native Module Integration]] - Bridging JavaScript and native code
- [[Mobile Performance]] - Performance optimization techniques
- [[React Native]] - React Native framework patterns

#digital-wall #research #react-native #cross-platform #mobile-development #native-integration