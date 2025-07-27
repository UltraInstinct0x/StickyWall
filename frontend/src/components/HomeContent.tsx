"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { PureOEmbedLayout } from "@/components/PureOEmbedLayout";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Grid3X3, List } from "lucide-react";

// Custom hook for responsive behavior
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  return isMobile;
}

interface Wall {
  id: number;
  name: string;
  item_count: number;
  created_at: string;
}

interface ShareItem {
  id: number;
  title: string;
  url: string;
  content_type: string;
  preview_url?: string;
  created_at: string;
  metadata: Record<string, any>;
}

export function HomeContent() {
  const searchParams = useSearchParams();
  const [walls, setWalls] = useState<Wall[]>([]);
  const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
  const [wallItems, setWallItems] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"masonry" | "list">("masonry");
  const isMobile = useIsMobile();

  // Force masonry on mobile, allow choice on desktop
  const effectiveViewMode = isMobile ? "masonry" : viewMode;

  useEffect(() => {
    fetchWalls();

    // Handle success message from URL params
    const shareSuccess = searchParams.get("share");
    const shareError = searchParams.get("error");

    if (shareSuccess === "success") {
      setSuccessMessage("Content added successfully!");
      // Clear the URL params without refreshing the page
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/");
      }
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      // Refresh walls after a brief delay to ensure backend processing is complete
      setTimeout(() => {
        fetchWalls();
      }, 1000);
    }

    if (shareError === "share_failed") {
      setError("Failed to add content. Please try again.");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/");
      }
      setTimeout(() => {
        setError(null);
      }, 3000);
    }
  }, [searchParams]);

  const fetchWalls = async () => {
    try {
      const response = await fetch(`/api/walls`);
      if (!response.ok) throw new Error("Failed to fetch walls");
      const data = await response.json();
      setWalls(data);
      setError(null);
      if (data.length > 0) {
        setSelectedWall(data[0]);
        fetchWallItems(data[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch walls");
      setLoading(false);
    }
  };

  const fetchWallItems = async (wallId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/walls/${wallId}`);
      if (!response.ok) throw new Error("Failed to fetch wall items");
      const data = await response.json();
      setWallItems(data.items || []);
      setError(null);
    } catch (err) {
      console.error("Error in fetchWallItems:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch wall items",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleWallSelect = (wall: Wall) => {
    setSelectedWall(wall);
    fetchWallItems(wall.id);
  };

  const handleAddItem = async (url: string, wallId?: number) => {
    try {
      const formData = new FormData();
      formData.append("url", url);
      const targetWallId = wallId || selectedWall?.id;
      if (targetWallId) {
        formData.append("wall_id", targetWallId.toString());
      }

      const response = await fetch("/api/add-content", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        // Success - refresh data immediately
        await fetchWalls();
        if (selectedWall) {
          await fetchWallItems(selectedWall.id);
        }
        setSuccessMessage("Content added successfully!");
        setTimeout(() => {
          setSuccessMessage(null);
        }, 3000);
      } else {
        throw new Error(result.error || "Failed to add item");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to add item");
      setTimeout(() => {
        setError(null);
      }, 3000);
    }
  };

  if (loading && walls.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Success/Error Messages */}
      {successMessage && (
        <Card className="card-base border-green-200 bg-green-50">
          <CardContent className="p-3 sm:p-4">
            <p className="text-green-700 text-sm">{successMessage}</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="card-base border-red-200 bg-red-50">
          <CardContent className="p-3 sm:p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Wall Content - Now Primary */}
      {walls.length === 0 && !loading ? (
        <Card className="card-base">
          <CardContent className="text-center py-12 sm:py-16 px-4">
            <div className="mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-warm-peach rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl sm:text-4xl">🎨</span>
              </div>
            </div>
            <h2 className="text-lg sm:text-2xl font-semibold mb-3 sm:mb-4">
              Start Your Digital Wall
            </h2>
            <p className="max-w-sm sm:max-w-md mx-auto text-muted-foreground text-sm sm:text-base leading-relaxed">
              Create a beautiful collection of content from across the web.
              Share links, articles, videos, and more in one organized space.
            </p>
          </CardContent>
        </Card>
      ) : selectedWall ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Wall Header */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">
                {selectedWall.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {wallItems.length} items
              </p>
            </div>
            <div className="hidden md:flex space-x-1 bg-muted rounded-lg p-1 w-fit">
              <Button
                variant={viewMode === "masonry" ? "default" : "ghost"}
                size="sm"
                className="touch-target px-3 sm:px-4"
                onClick={() => setViewMode("masonry")}
              >
                <Grid3X3 className="w-4 h-4" />
                <span className="ml-1">Masonry</span>
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="touch-target px-3 sm:px-4"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
                <span className="ml-1">List</span>
              </Button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-8 sm:py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <PureOEmbedLayout
              items={wallItems}
              viewMode={effectiveViewMode}
              onViewInWall={(item) => {
                // TODO: Open post details modal or page within digital wall
                console.log("View in wall:", item);
              }}
              onViewSource={(url) => {
                window.open(url, "_blank");
              }}
            />
          )}

          {wallItems.length === 0 && !loading && (
            <Card className="card-base">
              <CardContent className="text-center py-8 sm:py-12 px-4">
                <div className="mb-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-warm-peach rounded-full flex items-center justify-center mb-4">
                    <span className="text-3xl sm:text-4xl">✨</span>
                  </div>
                </div>
                <h3 className="text-base sm:text-lg font-medium mb-2">
                  Your wall awaits
                </h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Ready to collect your first piece of content?
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {/* Floating Action Button for Adding Content */}
      <FloatingActionButton 
        onAddItem={handleAddItem} 
        walls={walls}
        selectedWall={selectedWall}
      />
    </div>
  );
}
