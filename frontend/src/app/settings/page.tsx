'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SettingsSection {
  id: string;
  title: string;
  icon: string;
  items: SettingItem[];
}

interface SettingItem {
  id: string;
  label: string;
  description?: string;
  type: 'toggle' | 'select' | 'action' | 'info';
  value?: any;
  options?: { value: string; label: string }[];
  action?: () => void;
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, any>>({
    notifications: true,
    autoRefresh: true,
    compactView: false,
    darkMode: true,
    defaultView: 'masonry',
    shareTarget: true,
    analytics: false,
    backgroundSync: true
  });

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('digitalWallSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    }
  }, []);

  const updateSetting = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('digitalWallSettings', JSON.stringify(newSettings));
  };

  const clearData = () => {
    if (confirm('Are you sure you want to clear all local data? This action cannot be undone.')) {
      localStorage.clear();
      sessionStorage.clear();
      alert('Local data cleared successfully!');
    }
  };

  const exportData = async () => {
    try {
      // Fetch user walls and data
      const response = await fetch('/api/walls');
      if (!response.ok) throw new Error('Failed to fetch data');

      const walls = await response.json();
      const exportData = {
        walls,
        settings,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `digital-wall-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export data: ' + error);
    }
  };

  const refreshApp = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => registration.unregister());
      });
    }
    window.location.reload();
  };

  const settingsSections: SettingsSection[] = [
    {
      id: 'appearance',
      title: 'Appearance',
      icon: '🎨',
      items: [
        {
          id: 'darkMode',
          label: 'Dark Mode',
          description: 'Use dark theme throughout the app',
          type: 'toggle',
          value: settings.darkMode
        },
        {
          id: 'compactView',
          label: 'Compact View',
          description: 'Show more content with smaller cards',
          type: 'toggle',
          value: settings.compactView
        },
        {
          id: 'defaultView',
          label: 'Default View',
          description: 'Choose your preferred content layout',
          type: 'select',
          value: settings.defaultView,
          options: [
            { value: 'masonry', label: 'Masonry Grid' },
            { value: 'grid', label: 'Regular Grid' },
            { value: 'list', label: 'List View' }
          ]
        }
      ]
    },
    {
      id: 'behavior',
      title: 'Behavior',
      icon: '⚡',
      items: [
        {
          id: 'autoRefresh',
          label: 'Auto Refresh',
          description: 'Automatically refresh content when app becomes active',
          type: 'toggle',
          value: settings.autoRefresh
        },
        {
          id: 'backgroundSync',
          label: 'Background Sync',
          description: 'Sync data in the background when possible',
          type: 'toggle',
          value: settings.backgroundSync
        },
        {
          id: 'shareTarget',
          label: 'Share Target',
          description: 'Allow other apps to share content to Digital Wall',
          type: 'toggle',
          value: settings.shareTarget
        }
      ]
    },
    {
      id: 'privacy',
      title: 'Privacy & Data',
      icon: '🔒',
      items: [
        {
          id: 'analytics',
          label: 'Usage Analytics',
          description: 'Help improve the app by sharing anonymous usage data',
          type: 'toggle',
          value: settings.analytics
        },
        {
          id: 'notifications',
          label: 'Notifications',
          description: 'Receive notifications for app updates and features',
          type: 'toggle',
          value: settings.notifications
        }
      ]
    },
    {
      id: 'data',
      title: 'Data Management',
      icon: '💾',
      items: [
        {
          id: 'exportData',
          label: 'Export Data',
          description: 'Download your walls and content as JSON',
          type: 'action',
          action: exportData
        },
        {
          id: 'clearData',
          label: 'Clear Local Data',
          description: 'Remove all locally stored data and settings',
          type: 'action',
          action: clearData
        }
      ]
    },
    {
      id: 'app',
      title: 'App',
      icon: '⚙️',
      items: [
        {
          id: 'version',
          label: 'Version',
          description: 'Digital Wall MVP v2.0.0',
          type: 'info'
        },
        {
          id: 'refresh',
          label: 'Refresh App',
          description: 'Force refresh and clear cache',
          type: 'action',
          action: refreshApp
        }
      ]
    }
  ];

  const renderSettingItem = (item: SettingItem) => {
    switch (item.type) {
      case 'toggle':
        return (
          <button
            onClick={() => updateSetting(item.id, !item.value)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${item.value ? 'bg-purple-600' : 'bg-gray-600'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${item.value ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        );

      case 'select':
        return (
          <select
            value={item.value}
            onChange={(e) => updateSetting(item.id, e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white"
          >
            {item.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'action':
        return (
          <button
            onClick={item.action}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-all"
          >
            {item.id === 'clearData' ? '🗑️' : item.id === 'exportData' ? '📥' : '🔄'}
          </button>
        );

      case 'info':
        return (
          <span className="text-sm text-gray-400">
            {item.description}
          </span>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-gray-800">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Settings</h1>
            <button
              onClick={() => router.back()}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {settingsSections.map((section) => (
            <div key={section.id} className="bg-gray-900/50 border border-gray-700 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold flex items-center space-x-2">
                  <span>{section.icon}</span>
                  <span>{section.title}</span>
                </h2>
              </div>

              <div className="divide-y divide-gray-700">
                {section.items.map((item) => (
                  <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <h3 className="font-medium text-white">{item.label}</h3>
                      {item.description && (
                        <p className="text-sm text-gray-400 mt-1">{item.description}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {renderSettingItem(item)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Additional Info */}
          <div className="text-center text-gray-500 text-sm space-y-2">
            <p>Digital Wall MVP - Context Curation Network</p>
            <p>Built for seamless cross-platform content sharing</p>
            <div className="flex justify-center space-x-4 mt-4">
              <button
                onClick={() => window.open('https://github.com/digital-wall-mvp', '_blank')}
                className="text-gray-400 hover:text-purple-400 transition-colors"
              >
                GitHub
              </button>
              <button
                onClick={() => alert('Privacy Policy: Your data stays on your device. We only collect anonymous usage statistics if enabled.')}
                className="text-gray-400 hover:text-purple-400 transition-colors"
              >
                Privacy
              </button>
              <button
                onClick={() => alert('Support: For issues or questions, please visit our GitHub repository.')}
                className="text-gray-400 hover:text-purple-400 transition-colors"
              >
                Support
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
