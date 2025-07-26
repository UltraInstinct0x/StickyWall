"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { WallGrid } from "@/components/WallGrid";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { AddByUrlForm } from "@/components/AddByUrlForm";

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
      setError(null); // Clear any previous errors
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
    console.log("Fetching wall items for wall ID:", wallId);
    try {
      setLoading(true);
      const response = await fetch(`/api/walls/${wallId}`);
      if (!response.ok) throw new Error("Failed to fetch wall items");
      const data = await response.json();
      console.log("Wall items received:", data.items?.length ?? 0);
      setWallItems(data.items || []);
      setError(null); // Clear any previous errors
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

  const handleAddItem = async (url: string) => {
    try {
      const formData = new FormData();
      formData.append("url", url);

      const response = await fetch("/api/share", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
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
        throw new Error("Failed to add item");
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
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-gray-800 mb-6">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-white mb-4">Your Wall</h1>

          <AddByUrlForm onAddItem={handleAddItem} />

          {successMessage && (
            <div className="bg-green-500/20 border border-green-500 text-green-100 px-4 py-3 rounded mt-4">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-100 px-4 py-3 rounded mt-4">
              {error}
            </div>
          )}
        </div>
      </header>

      <main className="px-4 pb-24">
        {walls.length === 0 && !loading ? (
          <div className="text-center text-gray-400 mt-16 py-12 border-2 border-dashed border-gray-700 rounded-lg">
            <h2 className="text-2xl font-semibold mb-4 text-white">
              Your Wall is Empty
            </h2>
            <p className="max-w-md mx-auto">
              Start sharing content from other apps or paste a URL above to get
              started.
            </p>
          </div>
        ) : selectedWall ? (
          <div>
            <div className="flex justify-between items-center mb-6">
              <p className="text-gray-400">{wallItems.length} items</p>
              <div className="flex space-x-2">
                <button
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-all"
                  title="Grid View"
                >
                  ⊞
                </button>
                <button
                  className="p-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-all"
                  title="List View"
                >
                  ☰
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <WallGrid items={wallItems} />
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
