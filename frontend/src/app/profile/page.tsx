"use client";

import { useState, useEffect } from "react";
import {
  User,
  Settings,
  BarChart3,
  Grid3X3,
  List,
  Calendar,
  Share2,
  Heart,
  Clock,
  Folder,
  Bell,
  Shield,
  Palette,
  Download,
  Trash2,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { PureOEmbedLayout } from "@/components/PureOEmbedLayout";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  { id: "walls", label: "Walls", icon: Folder },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

const WALL_VIEW_OPTIONS = [
  { id: "grid", label: "Grid", icon: Grid3X3 },
  { id: "list", label: "List", icon: List },
];

export default function ProfilePage() {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
  const [wallItems, setWallItems] = useState<ShareItem[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState("walls");
  const [wallViewMode, setWallViewMode] = useState("grid");
  const [showWallManager, setShowWallManager] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch user walls
      const wallsResponse = await fetch("/api/walls");
      if (!wallsResponse.ok) throw new Error("Failed to fetch walls");

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
              contentTypes[item.content_type] =
                (contentTypes[item.content_type] || 0) + 1;
            });
          }
        } catch (err) {
          console.warn(`Failed to fetch wall ${wall.id}:`, err);
        }
      }

      // Find most popular content type
      const favoriteContentType =
        Object.entries(contentTypes).sort(([, a], [, b]) => b - a)[0]?.[0] ||
        "mixed";

      // Calculate most active day (simplified)
      const dayActivity: Record<string, number> = {};
      allItems.forEach((item) => {
        const day = new Date(item.created_at).toLocaleDateString("en-US", {
          weekday: "long",
        });
        dayActivity[day] = (dayActivity[day] || 0) + 1;
      });
      const mostActiveDay =
        Object.entries(dayActivity).sort(([, a], [, b]) => b - a)[0]?.[0] ||
        "Monday";

      // Set stats
      setUserStats({
        totalWalls: wallsData.length,
        totalItems,
        totalShares: totalItems, // For now, same as items
        joinedDate: wallsData[0]?.created_at || new Date().toISOString(),
        mostActiveDay,
        favoriteContentType,
      });

      // Set initial selected wall
      if (wallsData.length > 0) {
        setSelectedWall(wallsData[0]);
        await loadWallItems(wallsData[0].id);
      }
    } catch (err) {
      console.error("Error loading user data:", err);
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const loadWallItems = async (wallId: number) => {
    try {
      const response = await fetch(`/api/walls/${wallId}`);
      if (!response.ok) throw new Error("Failed to fetch wall items");

      const data = await response.json();
      setWallItems(data.items || []);
    } catch (err) {
      console.error("Error loading wall items:", err);
      setError("Failed to load wall items");
    }
  };

  const handleWallSelect = (wall: Wall) => {
    setSelectedWall(wall);
    loadWallItems(wall.id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getContentTypeDisplay = (type: string) => {
    const types: Record<string, { label: string; icon: string }> = {
      url: { label: "Links", icon: "🔗" },
      image: { label: "Images", icon: "🖼️" },
      video: { label: "Videos", icon: "🎥" },
      text: { label: "Text", icon: "📝" },
      mixed: { label: "Mixed", icon: "🌍" },
      document: { label: "Documents", icon: "📄" },
    };
    return types[type] || { label: type, icon: "📄" };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="mobile-header">
        <div className="content-container py-6">
          {/* User Profile Section */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-ai-500 rounded-full flex items-center justify-center text-2xl font-bold text-white">
              <User className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Anonymous User</h1>
              <p className="text-muted-foreground text-sm">
                Member since{" "}
                {userStats ? formatDate(userStats.joinedDate) : "Unknown"}
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          {userStats && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="card-base text-center">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">
                    {userStats.totalWalls}
                  </div>
                  <div className="text-xs text-muted-foreground">Walls</div>
                </CardContent>
              </Card>
              <Card className="card-base text-center">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-purple-500">
                    {userStats.totalItems}
                  </div>
                  <div className="text-xs text-muted-foreground">Items</div>
                </CardContent>
              </Card>
              <Card className="card-base text-center">
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-500">
                    {userStats.totalShares}
                  </div>
                  <div className="text-xs text-muted-foreground">Shares</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* View Options */}
          <div className="flex space-x-1 bg-muted rounded-lg p-1">
            {VIEW_OPTIONS.map((option) => {
              const IconComponent = option.icon;
              return (
                <Button
                  key={option.id}
                  variant={viewMode === option.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode(option.id)}
                  className="flex-1"
                >
                  <IconComponent className="w-4 h-4 mr-2" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="content-container py-6">
        {error && (
          <Card className="card-base border-red-200 bg-red-50 mb-6">
            <CardContent className="p-4">
              <p className="text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Walls View */}
        {viewMode === "walls" && (
          <div className="space-y-6">
            {/* Wall View Options */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Your Walls</h2>
              <div className="flex space-x-1 bg-muted rounded-lg p-1">
                {WALL_VIEW_OPTIONS.map((option) => {
                  const IconComponent = option.icon;
                  return (
                    <Button
                      key={option.id}
                      variant={wallViewMode === option.id ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setWallViewMode(option.id)}
                    >
                      <IconComponent className="w-4 h-4" />
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Wall Tabs */}
            <div className="flex overflow-x-auto space-x-2 pb-2">
              {walls.map((wall) => (
                <Button
                  key={wall.id}
                  variant={selectedWall?.id === wall.id ? "default" : "outline"}
                  onClick={() => handleWallSelect(wall)}
                  className="whitespace-nowrap"
                >
                  {wall.name} ({wall.item_count})
                  {wall.is_default && <span className="ml-1 text-xs">✨</span>}
                </Button>
              ))}
            </div>

            {/* Wall Content */}
            {selectedWall && (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold">{selectedWall.name}</h3>
                  <p className="text-muted-foreground">
                    {wallItems.length} items
                  </p>
                </div>

                <PureOEmbedLayout
                  items={wallItems}
                  viewMode={wallViewMode === "grid" ? "masonry" : wallViewMode as "masonry" | "list"}
                  onItemClick={(item) =>
                    item.url && window.open(item.url, "_blank")
                  }
                />

                {wallItems.length === 0 && (
                  <Card className="card-base">
                    <CardContent className="text-center py-12">
                      <div className="text-4xl mb-4">📭</div>
                      <h3 className="text-lg font-medium mb-2">
                        Wall is empty
                      </h3>
                      <p className="text-muted-foreground">
                        Start sharing content to see it here
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats View */}
        {viewMode === "stats" && userStats && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Analytics & Insights</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Activity Stats */}
              <Card className="card-base">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Activity Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Most Active Day
                    </span>
                    <span className="font-medium">
                      {userStats.mostActiveDay}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Favorite Content
                    </span>
                    <span className="font-medium flex items-center space-x-1">
                      <span>
                        {
                          getContentTypeDisplay(userStats.favoriteContentType)
                            .icon
                        }
                      </span>
                      <span>
                        {
                          getContentTypeDisplay(userStats.favoriteContentType)
                            .label
                        }
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Average per Wall
                    </span>
                    <span className="font-medium">
                      {userStats.totalWalls > 0
                        ? Math.round(
                            userStats.totalItems / userStats.totalWalls,
                          )
                        : 0}{" "}
                      items
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Content Breakdown */}
              <Card className="card-base">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Folder className="w-5 h-5" />
                    Wall Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {walls.slice(0, 3).map((wall) => (
                    <div
                      key={wall.id}
                      className="flex justify-between items-center"
                    >
                      <span className="text-muted-foreground truncate flex-1">
                        {wall.name}
                      </span>
                      <span className="font-medium ml-2">
                        {wall.item_count}
                      </span>
                    </div>
                  ))}
                  {walls.length > 3 && (
                    <div className="text-sm text-muted-foreground text-center pt-2">
                      +{walls.length - 3} more walls
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="card-base">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {wallItems.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center space-x-3 py-2"
                    >
                      <span className="text-lg">
                        {getContentTypeDisplay(item.content_type).icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {item.title || "Untitled"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(item.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Settings View */}
        {viewMode === "settings" && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Settings</h2>

            {/* Notifications */}
            <Card className="card-base">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Manage how you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Share Confirmations</h4>
                    <p className="text-sm text-muted-foreground">
                      Get notified when items are added
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    On
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">AI Insights</h4>
                    <p className="text-sm text-muted-foreground">
                      Receive AI-powered content insights
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    On
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Privacy & Security */}
            <Card className="card-base">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Privacy & Security
                </CardTitle>
                <CardDescription>
                  Control your privacy and security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Anonymous Mode</h4>
                    <p className="text-sm text-muted-foreground">
                      Keep your sharing activity private
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    On
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Data Encryption</h4>
                    <p className="text-sm text-muted-foreground">
                      Encrypt sensitive content
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    On
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Appearance */}
            <Card className="card-base">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Appearance
                </CardTitle>
                <CardDescription>Customize the look and feel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Theme</h4>
                    <p className="text-sm text-muted-foreground">
                      Choose your preferred theme
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Auto
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Grid Density</h4>
                    <p className="text-sm text-muted-foreground">
                      Adjust content spacing
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Comfortable
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Data Management */}
            <Card className="card-base">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  Data Management
                </CardTitle>
                <CardDescription>
                  Export, backup, or delete your data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export All Data
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Share2 className="w-4 h-4" />
                    Backup Settings
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="destructive"
                  className="w-full justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Delete All Data
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            {/* Account Actions */}
            <Card className="card-base">
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Manage your account settings</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full justify-between text-muted-foreground"
                >
                  <span className="flex items-center gap-2">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
