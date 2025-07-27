"use client";

import { useState, useEffect } from "react";
import { Search, Grid3X3, List, Layers } from "lucide-react";
import { PureOEmbedLayout } from "@/components/PureOEmbedLayout";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

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
  { id: "grid", label: "Grid", icon: Grid3X3 },
  { id: "list", label: "List", icon: List },
  { id: "masonry", label: "Masonry", icon: Layers },
];

const FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "recent", label: "Recent" },
  { id: "popular", label: "Popular" },
  { id: "images", label: "Images" },
  { id: "videos", label: "Videos" },
  { id: "links", label: "Links" },
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
      <div className="min-h-screen bg-background pb-20 md:pb-0">
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="mobile-header">
        <div className="content-container py-6">
          <h1 className="text-2xl font-bold mb-4">Explore</h1>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch(searchQuery)}
              className="pl-10"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex overflow-x-auto space-x-2 pb-2">
            {FILTER_OPTIONS.map((filter) => (
              <Button
                key={filter.id}
                variant={activeFilter === filter.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(filter.id)}
                className="whitespace-nowrap"
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* View Options */}
      <div className="border-b">
        <div className="content-container py-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {sections[0]?.items.length || 0} items found
            </span>

            <div className="hidden md:flex space-x-1 bg-muted rounded-lg p-1">
              {VIEW_OPTIONS.map((option) => {
                const IconComponent = option.icon;
                return (
                  <Button
                    key={option.id}
                    variant={viewMode === option.id ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode(option.id)}
                  >
                    <IconComponent className="w-4 h-4" />
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="content-container py-6">
        {error && (
          <Card className="card-base border-red-200 bg-red-50 mb-6">
            <CardContent className="p-4">
              <p className="text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {sections.map((section) => (
          <div key={section.id} className="mb-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">{section.title}</h2>
              <p className="text-muted-foreground">{section.description}</p>
            </div>

            {section.items.length === 0 ? (
              <Card className="card-base">
                <CardContent className="text-center py-12">
                  <div className="text-4xl mb-4">🔍</div>
                  <h3 className="text-lg font-medium mb-2">No content found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your filters or search terms
                  </p>
                </CardContent>
              </Card>
            ) : (
              <PureOEmbedLayout
                items={section.items}
                viewMode={viewMode === "grid" ? "masonry" : viewMode as "masonry" | "list"}
                onViewInWall={(item) => {
                  // TODO: Open post details modal or page within digital wall
                  console.log("View in wall:", item);
                }}
                onViewSource={(url) => {
                  window.open(url, "_blank");
                }}
              />
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
