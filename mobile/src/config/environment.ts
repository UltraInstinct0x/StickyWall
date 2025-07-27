/**
 * Environment Configuration
 * Centralized configuration for API endpoints and environment variables
 */

// Current ngrok tunnel URL - UPDATE THIS WHEN TUNNEL CHANGES
export const NGROK_BASE_URL = 'https://57891c1e054a.ngrok-free.app';

// Environment configuration
export const ENV_CONFIG = {
  // API Base URLs
  API_BASE_URL: __DEV__ ? NGROK_BASE_URL : 'https://api.digitalwall.app',
  WEB_BASE_URL: __DEV__ ? NGROK_BASE_URL : 'https://digitalwall.app',
  
  // Development settings
  IS_DEV: __DEV__,
  
  // API Headers for ngrok
  NGROK_HEADERS: {
    'ngrok-skip-browser-warning': 'true',
    'Content-Type': 'application/json',
  },
  
  // Timeouts
  API_TIMEOUT: 30000,
  SHARE_TIMEOUT: 15000,
} as const;

// Utility function to get API URL with proper headers
export const getApiConfig = () => ({
  baseURL: ENV_CONFIG.API_BASE_URL,
  headers: ENV_CONFIG.IS_DEV ? ENV_CONFIG.NGROK_HEADERS : {
    'Content-Type': 'application/json',
  },
  timeout: ENV_CONFIG.API_TIMEOUT,
});

export default ENV_CONFIG;