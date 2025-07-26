/**
 * Cross-Platform Share Service
 * Unified sharing logic for iOS and Android with offline sync capabilities
 */
import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { store } from '../store';
import { addShareItem, updateSyncStatus } from '../store/slices/shareSlice';

export interface ShareContent {
  id: string;
  type: 'text' | 'url' | 'image' | 'video' | 'file';
  title?: string;
  text?: string;
  url?: string;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  metadata?: Record<string, any>;
  timestamp: number;
  source: 'manual' | 'share_extension' | 'share_intent';
}

export interface SyncQueueItem extends ShareContent {
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retryCount: number;
  lastAttempt?: number;
  error?: string;
}

export interface ShareServiceConfig {
  apiBaseUrl: string;
  maxRetries: number;
  retryDelay: number;
  chunkSize: number;
  syncInterval: number;
  maxQueueSize: number;
}

class CrossPlatformShareService {
  private static instance: CrossPlatformShareService;
  private config: ShareServiceConfig;
  private syncQueue: SyncQueueItem[] = [];
  private syncInProgress = false;
  private isOnline = true;
  private eventEmitter?: NativeEventEmitter;
  private backgroundTaskId?: number;

  private readonly STORAGE_KEYS = {
    SYNC_QUEUE: '@DigitalWall:syncQueue',
    USER_SESSION: '@DigitalWall:userSession',
    OFFLINE_DATA: '@DigitalWall:offlineData',
  };

  private constructor(config: Partial<ShareServiceConfig> = {}) {
    this.config = {
      apiBaseUrl: 'https://31174a748985.ngrok-free.app',
      maxRetries: 3,
      retryDelay: 2000,
      chunkSize: 1024 * 1024, // 1MB
      syncInterval: 30000, // 30 seconds
      maxQueueSize: 100,
      ...config,
    };

    this.initialize();
  }

  static getInstance(config?: Partial<ShareServiceConfig>): CrossPlatformShareService {
    if (!CrossPlatformShareService.instance) {
      CrossPlatformShareService.instance = new CrossPlatformShareService(config);
    }
    return CrossPlatformShareService.instance;
  }

  private async initialize(): Promise<void> {
    // Load sync queue from storage
    await this.loadSyncQueue();

    // Setup network monitoring
    NetInfo.addEventListener(state => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected || false;
      
      if (!wasOnline && this.isOnline) {
        // Came back online, start sync
        this.startBackgroundSync();
      }
    });

    // Setup platform-specific share listeners
    if (Platform.OS === 'ios') {
      this.setupIOSShareListener();
    } else if (Platform.OS === 'android') {
      this.setupAndroidShareListener();
    }

    // Start periodic sync if online
    if (this.isOnline) {
      this.startBackgroundSync();
    }
  }

  private setupIOSShareListener(): void {
    const { IOSShareModule } = NativeModules;
    if (IOSShareModule) {
      this.eventEmitter = new NativeEventEmitter(IOSShareModule);
      this.eventEmitter.addListener('ShareReceived', this.handleIncomingShare.bind(this));
    }
  }

  private setupAndroidShareListener(): void {
    const { AndroidShareModule } = NativeModules;
    if (AndroidShareModule) {
      this.eventEmitter = new NativeEventEmitter(AndroidShareModule);
      this.eventEmitter.addListener('ShareReceived', this.handleIncomingShare.bind(this));
    }
  }

  private async handleIncomingShare(shareData: any): Promise<void> {
    try {
      const shareContent: ShareContent = {
        id: this.generateId(),
        type: this.detectContentType(shareData),
        title: shareData.title,
        text: shareData.text,
        url: shareData.url,
        filePath: shareData.filePath,
        fileName: shareData.fileName,
        mimeType: shareData.mimeType,
        metadata: shareData.metadata || {},
        timestamp: Date.now(),
        source: Platform.OS === 'ios' ? 'share_extension' : 'share_intent',
      };

      await this.addToQueue(shareContent);
      
      // Dispatch to Redux store for UI updates
      store.dispatch(addShareItem(shareContent));

      // Try immediate sync if online
      if (this.isOnline) {
        await this.processQueue();
      }

    } catch (error) {
      console.error('Failed to handle incoming share:', error);
    }
  }

  async shareContent(content: Omit<ShareContent, 'id' | 'timestamp' | 'source'>): Promise<string> {
    const shareContent: ShareContent = {
      ...content,
      id: this.generateId(),
      timestamp: Date.now(),
      source: 'manual',
    };

    await this.addToQueue(shareContent);
    
    // Dispatch to Redux store
    store.dispatch(addShareItem(shareContent));

    // Try immediate sync if online
    if (this.isOnline) {
      await this.processQueue();
    }

    return shareContent.id;
  }

  private async addToQueue(content: ShareContent): Promise<void> {
    const queueItem: SyncQueueItem = {
      ...content,
      status: 'pending',
      retryCount: 0,
    };

    // Check queue size limit
    if (this.syncQueue.length >= this.config.maxQueueSize) {
      // Remove oldest completed items
      this.syncQueue = this.syncQueue.filter(item => 
        item.status !== 'completed' || 
        Date.now() - item.timestamp < 24 * 60 * 60 * 1000 // Keep for 24 hours
      );
    }

    this.syncQueue.push(queueItem);
    await this.saveSyncQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    store.dispatch(updateSyncStatus({ syncing: true, queueLength: this.syncQueue.length }));

    try {
      const pendingItems = this.syncQueue.filter(item => 
        item.status === 'pending' || 
        (item.status === 'failed' && item.retryCount < this.config.maxRetries)
      );

      for (const item of pendingItems) {
        try {
          await this.syncItem(item);
        } catch (error) {
          console.error(`Failed to sync item ${item.id}:`, error);
        }
      }

      await this.saveSyncQueue();
    } finally {
      this.syncInProgress = false;
      const pendingCount = this.syncQueue.filter(item => item.status === 'pending').length;
      store.dispatch(updateSyncStatus({ syncing: false, queueLength: pendingCount }));
    }
  }

  private async syncItem(item: SyncQueueItem): Promise<void> {
    item.status = 'syncing';
    item.lastAttempt = Date.now();

    try {
      const formData = new FormData();
      
      // Add basic fields
      formData.append('title', item.title || '');
      formData.append('text', item.text || '');
      formData.append('url', item.url || '');
      formData.append('content_type', item.type);
      formData.append('source', 'mobile');
      formData.append('client_id', item.id);
      formData.append('timestamp', item.timestamp.toString());

      // Add metadata
      if (item.metadata) {
        formData.append('metadata', JSON.stringify(item.metadata));
      }

      // Handle file uploads
      if (item.filePath && item.type !== 'text' && item.type !== 'url') {
        formData.append('files', {
          uri: item.filePath,
          type: item.mimeType || 'application/octet-stream',
          name: item.fileName || 'shared_file',
        } as any);
      }

      // Get user session for API call
      const userSession = await this.getUserSession();
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        // Don't set Content-Type for FormData, let fetch set it with boundary
      };

      if (userSession?.token) {
        headers['Authorization'] = `Bearer ${userSession.token}`;
      }

      const response = await fetch(`${this.config.apiBaseUrl}/api/share`, {
        method: 'POST',
        body: formData,
        headers,
        timeout: 30000,
      });

      if (response.ok) {
        item.status = 'completed';
        item.error = undefined;
        console.log(`Successfully synced item ${item.id}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error: any) {
      item.retryCount++;
      item.error = error.message;
      
      if (item.retryCount >= this.config.maxRetries) {
        item.status = 'failed';
        console.error(`Failed to sync item ${item.id} after ${item.retryCount} attempts:`, error);
      } else {
        item.status = 'pending';
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, this.config.retryDelay * Math.pow(2, item.retryCount - 1))
        );
      }
    }
  }

  private startBackgroundSync(): void {
    // Clear existing interval
    if (this.backgroundTaskId) {
      clearInterval(this.backgroundTaskId);
    }

    // Start new interval
    this.backgroundTaskId = setInterval(() => {
      if (this.isOnline && this.syncQueue.some(item => item.status === 'pending')) {
        this.processQueue();
      }
    }, this.config.syncInterval) as any;
  }

  async forceSyncNow(): Promise<boolean> {
    if (!this.isOnline) {
      throw new Error('No internet connection available');
    }

    await this.processQueue();
    const failedItems = this.syncQueue.filter(item => item.status === 'failed');
    return failedItems.length === 0;
  }

  async retryFailedItems(): Promise<void> {
    this.syncQueue.forEach(item => {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.retryCount = 0;
        item.error = undefined;
      }
    });

    await this.saveSyncQueue();

    if (this.isOnline) {
      await this.processQueue();
    }
  }

  async clearCompletedItems(): Promise<void> {
    this.syncQueue = this.syncQueue.filter(item => 
      item.status !== 'completed' || 
      Date.now() - item.timestamp < 24 * 60 * 60 * 1000 // Keep for 24 hours
    );
    await this.saveSyncQueue();
  }

  getSyncStats(): {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    syncing: number;
  } {
    return {
      total: this.syncQueue.length,
      pending: this.syncQueue.filter(item => item.status === 'pending').length,
      completed: this.syncQueue.filter(item => item.status === 'completed').length,
      failed: this.syncQueue.filter(item => item.status === 'failed').length,
      syncing: this.syncQueue.filter(item => item.status === 'syncing').length,
    };
  }

  private async loadSyncQueue(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEYS.SYNC_QUEUE);
      if (stored) {
        this.syncQueue = JSON.parse(stored);
        console.log(`Loaded ${this.syncQueue.length} items from sync queue`);
      }
    } catch (error) {
      console.error('Failed to load sync queue:', error);
      this.syncQueue = [];
    }
  }

  private async saveSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.SYNC_QUEUE,
        JSON.stringify(this.syncQueue)
      );
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  private async getUserSession(): Promise<{ token?: string; userId?: string } | null> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEYS.USER_SESSION);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to get user session:', error);
      return null;
    }
  }

  private detectContentType(shareData: any): ShareContent['type'] {
    if (shareData.filePath) {
      const mimeType = shareData.mimeType?.toLowerCase() || '';
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType.startsWith('video/')) return 'video';
      return 'file';
    }
    
    if (shareData.url) return 'url';
    return 'text';
  }

  private generateId(): string {
    return `${Platform.OS}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup
  destroy(): void {
    if (this.backgroundTaskId) {
      clearInterval(this.backgroundTaskId);
    }
    
    if (this.eventEmitter) {
      this.eventEmitter.removeAllListeners('ShareReceived');
    }
  }
}

export default CrossPlatformShareService;