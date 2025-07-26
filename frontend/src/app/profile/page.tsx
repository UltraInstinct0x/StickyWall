'use client';

import { useState, useEffect } from 'react';
import { WallGrid } from '@/components/WallGrid';
import { LoadingSpinner } from '@/components/LoadingSpinner';

interface ShareItem {
  id: number;
  title: string;
  url: string;
  content_type: string;
  preview_url?: string;
  created_at: string;
  metadata: Record<string, any>;
}

interface Wall {
  id: number;
  name: string;
  description?: string;
  is_default: boolean;
  created_at: string;
  item_count: number;
}

interface UserStats {
  totalWalls: number;
  totalItems: number;
  totalShares: number;
  joinedDate: string;
  mostActiveDay: string;
  favoriteContentType: string;
}

const VIEW_OPTIONS = [
  { id: 'grid', label: 'Grid', icon: '⊞' },
  { id: 'list', label: 'List', icon: '☰' },
  { id: 'stats', label: 'Stats', icon: '📊' }
];

export default function ProfilePage() {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
  const [wallItems, setWallItems] = useState<ShareItem[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState('grid');
  const [showWallManager, setShowWallManager] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch user walls
      const wallsResponse = await fetch('/api/walls');
      if (!wallsResponse.ok) throw new Error('Failed to fetch walls');

      const wallsData = await wallsResponse.json();
      setWalls(wallsData);

      // Calculate user stats
      let totalItems = 0;
      const allItems: ShareItem[] = [];
      const contentTypes: Record<string, number> = {};

      for (const wall of wallsData) {
        try {
          const wallResponse = await fetch(`/api/walls/${wall.id}`);
          if (wallResponse.ok) {
            const wallData = await wallResponse.json();
            const items = wallData.items || [];
            totalItems += items.length;
            allItems.push(...items);

            // Count content types
            items.forEach((item: ShareItem) => {
              contentTypes[item.content_type] = (contentTypes[item.content_type] || 0) + 1;
            });
          }
        } catch (err) {
          console.warn(`Failed to fetch wall ${wall.id}:`, err);
        }
      }

      // Find most popular content type
      const favoriteContentType = Object.entries(contentTypes)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'mixed';

      // Calculate most active day (simplified)
      const dayActivity: Record<string, number> = {};
      allItems.forEach(item => {
        const day = new Date(item.created_at).toLocaleDateString('en-US', { weekday: 'long' });
        dayActivity[day] = (dayActivity[day] || 0) + 1;
      });
      const mostActiveDay = Object.entries(dayActivity)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Monday';

      // Set stats
      setUserStats({
        totalWalls: wallsData.length,
        totalItems,
        totalShares: totalItems, // For now, same as items
        joinedDate: wallsData[0]?.created_at || new Date().toISOString(),
        mostActiveDay,
        favoriteContentType
      });

      // Set initial selected wall
      if (wallsData.length > 0) {
        setSelectedWall(wallsData[0]);
        await loadWallItems(wallsData[0].id);
      }

    } catch (err) {
      console.error('Error loading user data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadWallItems = async (wallId: number) => {
    try {
      const response = await fetch(`/api/walls/${wallId}`);
      if (!response.ok) throw new Error('Failed to fetch wall items');

      const data = await response.json();
      setWallItems(data.items || []);
    } catch (err) {
      console.error('Error loading wall items:', err);
      setError('Failed to load wall items');
    }
  };

  const handleWallSelect = (wall: Wall) => {
    setSelectedWall(wall);
    loadWallItems(wall.id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getContentTypeDisplay = (type: string) => {
    const types: Record<string, { label: string; icon: string }> = {
      'url': { label: 'Links', icon: '🔗' },
      'image': { label: 'Images', icon: '🖼️' },
      'video': { label: 'Videos', icon: '🎥' },
      'text': { label: 'Text', icon: '📝' },
      'mixed': { label: 'Mixed', icon: '🌍' },
      'document': { label: 'Documents', icon: '📄' }
    };
    return types[type] || { label: type, icon: '📄' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-gray-800">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Profile</h1>
            <button
              onClick={() => setShowWallManager(!showWallManager)}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all"
              title="Manage Walls"
            >
              ⚙️
            </button>
          </div>

          {/* User Avatar & Basic Info */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-2xl font-bold">
              U
            </div>
            <div>
              <h2 className="text-xl font-semibold">Anonymous User</h2>
              <p className="text-gray-400 text-sm">
                Member since {userStats ? formatDate(userStats.joinedDate) : 'Unknown'}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          {userStats && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{userStats.totalWalls}</div>
                <div className="text-xs text-gray-400">Walls</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{userStats.totalItems}</div>
                <div className="text-xs text-gray-400">Items</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{userStats.totalShares}</div>
                <div className="text-xs text-gray-400">Shares</div>
              </div>
            </div>
          )}

          {/* View Options */}
          <div className="flex space-x-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setViewMode(option.id)}
                className={`
                  px-3 py-2 rounded-lg text-sm transition-all
                  ${viewMode === option.id
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }
                `}
              >
                {option.icon} {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-6">
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-100 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Wall Manager */}
        {showWallManager && (
          <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold mb-4">Wall Manager</h3>
            <div className="space-y-2">
              {walls.map((wall) => (
                <div
                  key={wall.id}
                  className="flex items-center justify-between p-3 bg-gray-800/50 rounded border border-gray-700"
                >
                  <div>
                    <h4 className="font-medium">{wall.name}</h4>
                    <p className="text-sm text-gray-400">
                      {wall.item_count} items • {wall.is_default ? 'Default' : 'Custom'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleWallSelect(wall)}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-all"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats View */}
        {viewMode === 'stats' && userStats && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Activity Stats */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">📊 Activity Stats</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Most Active Day</span>
                    <span className="font-medium">{userStats.mostActiveDay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Favorite Content</span>
                    <span className="font-medium flex items-center space-x-1">
                      <span>{getContentTypeDisplay(userStats.favoriteContentType).icon}</span>
                      <span>{getContentTypeDisplay(userStats.favoriteContentType).label}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Average per Wall</span>
                    <span className="font-medium">
                      {userStats.totalWalls > 0 ? Math.round(userStats.totalItems / userStats.totalWalls) : 0} items
                    </span>
                  </div>
                </div>
              </div>

              {/* Content Breakdown */}
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">🏗️ Wall Overview</h3>
                <div className="space-y-3">
                  {walls.slice(0, 3).map((wall) => (
                    <div key={wall.id} className="flex justify-between items-center">
                      <span className="text-gray-400 truncate flex-1">{wall.name}</span>
                      <span className="font-medium ml-2">{wall.item_count}</span>
                    </div>
                  ))}
                  {walls.length > 3 && (
                    <div className="text-sm text-gray-500 text-center pt-2">
                      +{walls.length - 3} more walls
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">🕒 Recent Activity</h3>
              {wallItems.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center space-x-3 py-2">
                  <span className="text-lg">
                    {getContentTypeDisplay(item.content_type).icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title || 'Untitled'}</p>
                    <p className="text-sm text-gray-400">
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Wall Selection */}
        {viewMode !== 'stats' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold">Your Walls</h2>
                <p className="text-gray-400 text-sm">Select a wall to view its content</p>
              </div>
            </div>

            {/* Wall Tabs */}
            <div className="flex overflow-x-auto space-x-2 mb-6 pb-2">
              {walls.map((wall) => (
                <button
                  key={wall.id}
                  onClick={() => handleWallSelect(wall)}
                  className={`
                    px-4 py-2 rounded-lg whitespace-nowrap transition-all
                    ${selectedWall?.id === wall.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }
                  `}
                >
                  {wall.name} ({wall.item_count})
                  {wall.is_default && (
                    <span className="ml-1 text-xs opacity-75">✨</span>
                  )}
                </button>
              ))}
            </div>

            {/* Wall Content */}
            {selectedWall && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-semibold">{selectedWall.name}</h3>
                    <p className="text-gray-400">{wallItems.length} items</p>
                  </div>
                </div>

                {viewMode === 'list' ? (
                  <div className="space-y-3">
                    {wallItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 hover:border-purple-500/50 transition-all cursor-pointer"
                        onClick={() => item.url && window.open(item.url, '_blank')}
                      >
                        <div className="flex items-start space-x-3">
                          {item.preview_url && (
                            <img
                              src={item.preview_url}
                              alt={item.title}
                              className="w-16 h-16 object-cover rounded"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-white truncate">
                              {item.title || 'Untitled'}
                            </h4>
                            <p className="text-sm text-gray-400 truncate">
                              {getContentTypeDisplay(item.content_type).label}
                            </p>
                            <time className="text-xs text-gray-500">
                              {formatDate(item.created_at)}
                            </time>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <WallGrid items={wallItems} />
                )}

                {wallItems.length === 0 && (
                  <div className="text-center text-gray-400 py-12">
                    <div className="text-4xl mb-4">📭</div>
                    <h3 className="text-lg font-medium mb-2">Wall is empty</h3>
                    <p>Start sharing content to see it here</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
