import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { ShareModule } = NativeModules;

interface ShareData {
  text?: string;
  url?: string;
  title?: string;
  files?: string[];
}

class ShareService {
  private eventEmitter: NativeEventEmitter;
  private shareDataListener: any = null;

  constructor() {
    if (ShareModule) {
      this.eventEmitter = new NativeEventEmitter(ShareModule);
    }
  }

  /**
   * Initialize share listener to handle incoming share intents
   */
  startListening(callback: (shareData: ShareData) => void) {
    if (!this.eventEmitter) {
      console.log('ShareModule not available');
      return;
    }

    this.shareDataListener = this.eventEmitter.addListener(
      'ShareDataReceived',
      (shareData: ShareData) => {
        console.log('Received share data:', shareData);
        this.processShareData(shareData);
        callback(shareData);
      }
    );

    // For Android, check for initial share intent
    if (Platform.OS === 'android' && ShareModule.handleIncomingShare) {
      ShareModule.handleIncomingShare();
    }
  }

  /**
   * Stop listening for share events
   */
  stopListening() {
    if (this.shareDataListener) {
      this.shareDataListener.remove();
      this.shareDataListener = null;
    }
  }

  /**
   * Process shared data and send to backend
   */
  async processShareData(shareData: ShareData): Promise<boolean> {
    try {
      const API_BASE = 'https://31174a748985.ngrok-free.app'; // Digital Wall backend via ngrok
      
      // Get or create anonymous session ID
      let sessionId = await AsyncStorage.getItem('sessionId');
      if (!sessionId) {
        const platform = Platform.OS;
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substr(2, 8);
        sessionId = `${platform}_${timestamp}_${randomId}`;
        await AsyncStorage.setItem('sessionId', sessionId);
      }

      const formData = new FormData();
      
      if (shareData.title) {
        formData.append('title', shareData.title);
      }
      if (shareData.text) {
        formData.append('text', shareData.text);
      }
      if (shareData.url) {
        formData.append('url', shareData.url);
      }
      formData.append('session_id', sessionId);
      formData.append('source', Platform.OS === 'ios' ? 'ios_share_extension' : 'android_share');

      const response = await fetch(`${API_BASE}/api/share`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          // Don't set Content-Type for FormData, let the browser set it with boundary
        },
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Share data processed successfully:', result);
        return true;
      } else {
        const errorText = await response.text();
        console.error('Failed to process share data:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('Error processing share data:', error);
      return false;
    }
  }

  /**
   * Manually share data (for testing purposes)
   */
  async shareManually(shareData: ShareData): Promise<boolean> {
    if (ShareModule && ShareModule.processShareData) {
      try {
        const result = await ShareModule.processShareData(shareData);
        return result.success;
      } catch (error) {
        console.error('Manual share error:', error);
        return false;
      }
    }
    
    // Fallback to direct API call
    return this.processShareData(shareData);
  }

  /**
   * Get session ID for API calls
   */
  async getSessionId(): Promise<string> {
    let sessionId = await AsyncStorage.getItem('sessionId');
    if (!sessionId) {
      const platform = Platform.OS;
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 8);
      sessionId = `${platform}_${timestamp}_${randomId}`;
      await AsyncStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }
}

export default new ShareService();