"use client";

import { useState, useEffect } from "react";
import { WallGrid } from "@/components/WallGrid";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface ShareItem {
  id: number;
  title: string;
  url: string;
  content_type: string;
  preview_url?: string;
  created_at: string;
  metadata: Record<string, any>;
}

interface ExploreSection {
  id: string;
  title: string;
  description: string;
  items: ShareItem[];
}

const VIEW_OPTIONS = [
  { id: "grid", label: "Grid", icon: "⊞" },
  { id: "list", label: "List", icon: "☰" },
  { id: "masonry", label: "Masonry", icon: "⬚" },
];

const FILTER_OPTIONS = [
  { id: "all", label: "All", active: true },
  { id: "recent", label: "Recent", active: false },
  { id: "popular", label: "Popular", active: false },
  { id: "images", label: "Images", active: false },
  { id: "videos", label: "Videos", active: false },
  { id: "links", label: "Links", active: false },
];

export default function ExplorePage() {
  const [sections, setSections] = useState<ExploreSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [viewMode, setViewMode] = useState("masonry");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchExploreContent();
  }, [activeFilter]);

  const fetchExploreContent = async () => {
    try {
      setLoading(true);
      setError(null);

      // For now, fetch all walls and aggregate content
      // In the future, this would be a dedicated explore API
      const response = await fetch("/api/walls");
      if (!response.ok) throw new Error("Failed to fetch explore content");

      const walls = await response.json();

      // Fetch items from all walls
      const allItems: ShareItem[] = [];

      for (const wall of walls) {
        try {
          const wallResponse = await fetch(`/api/walls/${wall.id}`);
          if (wallResponse.ok) {
            const wallData = await wallResponse.json();
            allItems.push(...(wallData.items || []));
          }
        } catch (err) {
          console.warn(`Failed to fetch wall ${wall.id}:`, err);
        }
      }

      // Sort and filter items
      let filteredItems = [...allItems];

      switch (activeFilter) {
        case "recent":
          filteredItems = filteredItems
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )
            .slice(0, 20);
          break;
        case "popular":
          // For now, just shuffle - in the future this would be based on engagement
          filteredItems = filteredItems
            .sort(() => Math.random() - 0.5)
            .slice(0, 20);
          break;
        case "images":
          filteredItems = filteredItems.filter(
            (item) => item.content_type.includes("image") || item.preview_url,
          );
          break;
        case "videos":
          filteredItems = filteredItems.filter((item) =>
            item.content_type.includes("video"),
          );
          break;
        case "links":
          filteredItems = filteredItems.filter(
            (item) =>
              item.url &&
              !item.content_type.includes("image") &&
              !item.content_type.includes("video"),
          );
          break;
        default:
          filteredItems = filteredItems.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
          break;
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredItems = filteredItems.filter(
          (item) =>
            item.title?.toLowerCase().includes(query) ||
            item.url?.toLowerCase().includes(query),
        );
      }

      // Create sections
      const exploreSections: ExploreSection[] = [
        {
          id: "main",
          title: getFilterTitle(activeFilter),
          description: getFilterDescription(activeFilter),
          items: filteredItems,
        },
      ];

      setSections(exploreSections);
    } catch (err) {
      console.error("Error fetching explore content:", err);
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  const getFilterTitle = (filter: string): string => {
    switch (filter) {
      case "recent":
        return "Recent Content";
      case "popular":
        return "Popular Content";
      case "images":
        return "Images & Visuals";
      case "videos":
        return "Videos";
      case "links":
        return "Links & Articles";
      default:
        return "All Content";
    }
  };

  const getFilterDescription = (filter: string): string => {
    switch (filter) {
      case "recent":
        return "Latest shared content across all walls";
      case "popular":
        return "Trending and engaging content";
      case "images":
        return "Visual content and images";
      case "videos":
        return "Video content and media";
      case "links":
        return "External links and articles";
      default:
        return "Discover content from across the platform";
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    fetchExploreContent();
  };

  if (loading && sections.length === 0) {
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
          <h1 className="text-2xl font-bold mb-4">Explore</h1>

          {/* Search Bar */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch(searchQuery)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 pr-10 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={() => handleSearch(searchQuery)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-purple-400"
            >
              🔍
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex overflow-x-auto space-x-2 pb-2">
            {FILTER_OPTIONS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`
                  px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all
                  ${
                    activeFilter === filter.id
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }
                `}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* View Options */}
      <div className="px-4 py-2 border-b border-gray-800">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">
            {sections[0]?.items.length || 0} items found
          </span>

          <div className="flex space-x-1">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => setViewMode(option.id)}
                className={`
                  p-2 rounded text-sm transition-all
                  ${
                    viewMode === option.id
                      ? "bg-purple-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }
                `}
                title={option.label}
              >
                {option.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="px-4 py-6">
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-100 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {sections.map((section) => (
          <div key={section.id} className="mb-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white mb-2">
                {section.title}
              </h2>
              <p className="text-gray-400">{section.description}</p>
            </div>

            {section.items.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-medium mb-2">No content found</h3>
                <p>Try adjusting your filters or search terms</p>
              </div>
            ) : (
              <div
                className={`
                ${viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" : ""}
                ${viewMode === "list" ? "space-y-4" : ""}
                ${viewMode === "masonry" ? "" : ""}
              `}
              >
                {viewMode === "masonry" ? (
                  <WallGrid items={section.items} />
                ) : viewMode === "list" ? (
                  <div className="space-y-3">
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 hover:border-purple-500/50 transition-all cursor-pointer"
                        onClick={() =>
                          item.url && window.open(item.url, "_blank")
                        }
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
                            <h3 className="font-medium text-white truncate">
                              {item.title || "Untitled"}
                            </h3>
                            <p className="text-sm text-gray-400 truncate">
                              {item.content_type}
                            </p>
                            <time className="text-xs text-gray-500">
                              {new Date(item.created_at).toLocaleDateString()}
                            </time>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  section.items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50 hover:border-purple-500/50 transition-all cursor-pointer aspect-square"
                      onClick={() =>
                        item.url && window.open(item.url, "_blank")
                      }
                    >
                      {item.preview_url ? (
                        <img
                          src={item.preview_url}
                          alt={item.title}
                          className="w-full h-2/3 object-cover"
                        />
                      ) : (
                        <div className="w-full h-2/3 bg-gray-700 flex items-center justify-center">
                          <span className="text-2xl">
                            {item.content_type.includes("video")
                              ? "🎥"
                              : item.content_type.includes("image")
                                ? "🖼️"
                                : "🔗"}
                          </span>
                        </div>
                      )}
                      <div className="p-3">
                        <h3 className="text-sm font-medium text-white truncate">
                          {item.title || "Untitled"}
                        </h3>
                        <time className="text-xs text-gray-500">
                          {new Date(item.created_at).toLocaleDateString()}
                        </time>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        )}
      </main>
    </div>
  );
}
