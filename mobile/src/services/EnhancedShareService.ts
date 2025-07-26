/**
 * Enhanced Share Service with Advanced Features
 * - Offline queue management
 * - Background sync
 * - AI-powered content preprocessing
 * - Smart notifications
 */
import { NativeModules, NativeEventEmitter, Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import NetInfo from '@react-native-netinfo/netinfo';

const { ShareModule } = NativeModules;

interface ShareData {
  text?: string;
  url?: string;
  title?: string;
  files?: string[];
  mimeType?: string;
  timestamp?: string;
  source?: string;
}

interface QueuedShare extends ShareData {
  id: string;
  retryCount: number;
  createdAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  aiPreview?: {
    category: string;
    tags: string[];
    summary: string;
  };
}

interface ShareConfig {
  apiUrl: string;
  authToken?: string;
  offlineMode: boolean;
  aiProcessing: boolean;
  backgroundSync: boolean;
}

class EnhancedShareService {
  private eventEmitter: NativeEventEmitter;
  private shareDataListener: any = null;
  private config: ShareConfig;
  private offlineQueue: QueuedShare[] = [];
  private isOnline: boolean = true;
  private syncInProgress: boolean = false;

  private readonly STORAGE_KEYS = {
    OFFLINE_QUEUE: '@DigitalWall:offlineQueue',
    SHARE_CONFIG: '@DigitalWall:shareConfig',
    PROCESSED_SHARES: '@DigitalWall:processedShares',
  };

  constructor(config: Partial<ShareConfig> = {}) {
    this.config = {
      apiUrl: 'https://31174a748985.ngrok-free.app',
      offlineMode: true,
      aiProcessing: true,
      backgroundSync: true,
      ...config,
    };

    if (ShareModule) {
      this.eventEmitter = new NativeEventEmitter(ShareModule);
    }

    this.initializeService();
  }

  private async initializeService() {
    // Load offline queue
    await this.loadOfflineQueue();

    // Setup network monitoring
    NetInfo.addEventListener(state => {
      this.isOnline = state.isConnected || false;
      if (this.isOnline && this.config.backgroundSync) {
        this.processOfflineQueue();
      }
    });

    // Handle app state changes
    AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' && this.config.backgroundSync) {
        this.saveOfflineQueue();
      }
    });
  }

  /**
   * Enhanced share listener with AI preprocessing
   */
  async startListening(callback: (shareData: ShareData, preview?: any) => void) {
    if (!this.eventEmitter) {
      console.log('ShareModule not available');
      return;
    }

    this.shareDataListener = this.eventEmitter.addListener(
      'ShareDataReceived',
      async (shareData: ShareData) => {
        console.log('📥 Received share data:', shareData);

        // Generate unique ID for tracking
        const queuedShare: QueuedShare = {
          ...shareData,
          id: `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          status: 'pending',
          timestamp: new Date().toISOString(),
        };

        // AI preprocessing if enabled
        if (this.config.aiProcessing) {
          try {
            const aiPreview = await this.generateAIPreview(shareData);
            queuedShare.aiPreview = aiPreview;
          } catch (error) {
            console.log('⚠️ AI preprocessing failed:', error);
          }
        }

        // Add to queue
        this.offlineQueue.push(queuedShare);
        await this.saveOfflineQueue();

        // Try immediate processing if online
        if (this.isOnline) {
          await this.processShareItem(queuedShare);
        }

        callback(shareData, queuedShare.aiPreview);
      }
    );

    // Check for initial share intent (Android)
    if (Platform.OS === 'android' && ShareModule.handleIncomingShare) {
      ShareModule.handleIncomingShare();
    }
  }

  /**
   * Generate AI preview for content before full processing
   */
  private async generateAIPreview(shareData: ShareData): Promise<any> {
    try {
      // Quick local analysis first
      const localPreview = this.generateLocalPreview(shareData);

      // If online, get AI insights
      if (this.isOnline) {
        const response = await axios.post(`${this.config.apiUrl}/api/ai/insights`, {
          content: {
            url: shareData.url,
            text: shareData.text,
            title: shareData.title,
          },
        }, {
          timeout: 5000, // Quick timeout for preview
          headers: this.config.authToken ? {
            'Authorization': `Bearer ${this.config.authToken}`,
          } : {},
        });

        return {
          ...localPreview,
          ...response.data,
          source: 'ai',
        };
      }

      return { ...localPreview, source: 'local' };
    } catch (error) {
      console.log('AI preview generation failed:', error);
      return this.generateLocalPreview(shareData);
    }
  }

  /**
   * Generate basic local preview without API
   */
  private generateLocalPreview(shareData: ShareData): any {
    const url = shareData.url || '';
    const text = shareData.text || '';
    const title = shareData.title || '';

    // Simple keyword-based categorization
    const content = `${url} ${text} ${title}`.toLowerCase();
    let category = 'general';
    const tags: string[] = [];

    // Basic categorization
    if (content.includes('github.com') || content.includes('code') || content.includes('api')) {
      category = 'development';
      tags.push('code', 'development');
    } else if (content.includes('youtube.com') || content.includes('video')) {
      category = 'video';
      tags.push('video', 'media');
    } else if (content.includes('article') || content.includes('blog')) {
      category = 'article';
      tags.push('article', 'reading');
    }

    // Extract domain as tag
    try {
      const urlObj = new URL(url);
      tags.push(urlObj.hostname.replace('www.', ''));
    } catch (e) {
      // Invalid URL
    }

    return {
      category,
      tags: tags.slice(0, 5),
      summary: text.substring(0, 150) + (text.length > 150 ? '...' : ''),
      source: 'local',
      confidence: 0.6,
    };
  }

  /**
   * Process individual share item
   */
  private async processShareItem(item: QueuedShare): Promise<boolean> {
    try {
      item.status = 'processing';
      await this.saveOfflineQueue();

      const formData = new FormData();
      formData.append('title', item.title || '');
      formData.append('text', item.text || '');
      formData.append('url', item.url || '');
      formData.append('source', 'mobile_enhanced');

      if (item.aiPreview) {
        formData.append('ai_preview', JSON.stringify(item.aiPreview));
      }

      const response = await axios.post(
        `${this.config.apiUrl}/api/share`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(this.config.authToken && {
              'Authorization': `Bearer ${this.config.authToken}`,
            }),
          },
          timeout: 30000,
        }
      );

      if (response.status === 200 || response.status === 303) {
        item.status = 'completed';

        // Remove from queue after successful processing
        this.offlineQueue = this.offlineQueue.filter(q => q.id !== item.id);
        await this.saveOfflineQueue();

        console.log('✅ Share processed successfully:', item.id);
        return true;
      }

      throw new Error(`Unexpected response status: ${response.status}`);

    } catch (error) {
      console.log('❌ Failed to process share:', error);

      item.retryCount++;
      item.status = item.retryCount >= 3 ? 'failed' : 'pending';
      await this.saveOfflineQueue();

      return false;
    }
  }

  /**
   * Process offline queue
   */
  private async processOfflineQueue() {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Processing offline queue:', this.offlineQueue.length, 'items');

    const pendingItems = this.offlineQueue.filter(
      item => item.status === 'pending' && item.retryCount < 3
    );

    for (const item of pendingItems) {
      await this.processShareItem(item);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.syncInProgress = false;
    console.log('✅ Offline queue processing completed');
  }

  /**
   * Get share statistics and queue status
   */
  async getShareStats(): Promise<{
    queueLength: number;
    pendingCount: number;
    completedCount: number;
    failedCount: number;
    isOnline: boolean;
    lastSync?: string;
  }> {
    const pending = this.offlineQueue.filter(item => item.status === 'pending').length;
    const completed = this.offlineQueue.filter(item => item.status === 'completed').length;
    const failed = this.offlineQueue.filter(item => item.status === 'failed').length;

    return {
      queueLength: this.offlineQueue.length,
      pendingCount: pending,
      completedCount: completed,
      failedCount: failed,
      isOnline: this.isOnline,
    };
  }

  /**
   * Manual sync trigger
   */
  async syncNow(): Promise<boolean> {
    if (!this.isOnline) {
      throw new Error('No internet connection');
    }

    await this.processOfflineQueue();
    return true;
  }

  /**
   * Clear completed items from queue
   */
  async clearCompletedItems() {
    this.offlineQueue = this.offlineQueue.filter(item => item.status !== 'completed');
    await this.saveOfflineQueue();
  }

  /**
   * Retry failed items
   */
  async retryFailedItems() {
    this.offlineQueue.forEach(item => {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.retryCount = 0;
      }
    });

    await this.saveOfflineQueue();

    if (this.isOnline) {
      await this.processOfflineQueue();
    }
  }

  /**
   * Storage management
   */
  private async loadOfflineQueue() {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEYS.OFFLINE_QUEUE);
      if (stored) {
        this.offlineQueue = JSON.parse(stored);
        console.log('📂 Loaded offline queue:', this.offlineQueue.length, 'items');
      }
    } catch (error) {
      console.log('Failed to load offline queue:', error);
      this.offlineQueue = [];
    }
  }

  private async saveOfflineQueue() {
    try {
      await AsyncStorage.setItem(
        this.STORAGE_KEYS.OFFLINE_QUEUE,
        JSON.stringify(this.offlineQueue)
      );
    } catch (error) {
      console.log('Failed to save offline queue:', error);
    }
  }

  /**
   * Configuration management
   */
  async updateConfig(newConfig: Partial<ShareConfig>) {
    this.config = { ...this.config, ...newConfig };
    await AsyncStorage.setItem(this.STORAGE_KEYS.SHARE_CONFIG, JSON.stringify(this.config));
  }

  getConfig(): ShareConfig {
    return { ...this.config };
  }

  /**
   * Cleanup
   */
  stopListening() {
    if (this.shareDataListener) {
      this.shareDataListener.remove();
      this.shareDataListener = null;
    }
  }

  /**
   * Background task support
   */
  async scheduleBackgroundSync() {
    // This would integrate with background task scheduling
    // Platform-specific implementation needed
    console.log('📅 Background sync scheduled');
  }
}

export { EnhancedShareService, ShareData, QueuedShare, ShareConfig };
export default EnhancedShareService;
