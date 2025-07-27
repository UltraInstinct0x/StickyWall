"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Filter, Clock, X } from "lucide-react";
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

interface SearchFilters {
  contentType: string;
  dateRange: string;
  sortBy: string;
}

const CONTENT_TYPE_FILTERS = [
  { id: "all", label: "All Types", icon: "🌍" },
  { id: "url", label: "Links", icon: "🔗" },
  { id: "image", label: "Images", icon: "🖼️" },
  { id: "video", label: "Videos", icon: "🎥" },
  { id: "text", label: "Text", icon: "📝" },
  { id: "document", label: "Documents", icon: "📄" },
];

const DATE_RANGE_FILTERS = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "year", label: "This Year" },
];

const SORT_OPTIONS = [
  { id: "relevance", label: "Relevance" },
  { id: "newest", label: "Newest First" },
  { id: "oldest", label: "Oldest First" },
  { id: "title", label: "Title A-Z" },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    contentType: "all",
    dateRange: "all",
    sortBy: "relevance",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Load recent searches from localStorage
    const saved = localStorage.getItem("recentSearches");
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        console.warn("Failed to load recent searches:", e);
      }
    }

    // Focus search input on mount
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Auto-search when query changes (with debounce)
    if (query.trim().length >= 2) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        performSearch();
      }, 300);
    } else if (query.trim().length === 0) {
      setResults([]);
      setHasSearched(false);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, filters]);

  const performSearch = useCallback(async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);
      setError(null);

      // Save to recent searches
      const trimmedQuery = query.trim();
      if (trimmedQuery && !recentSearches.includes(trimmedQuery)) {
        const newRecent = [trimmedQuery, ...recentSearches.slice(0, 4)];
        setRecentSearches(newRecent);
        localStorage.setItem("recentSearches", JSON.stringify(newRecent));
      }

      // Fetch all content to search through
      const response = await fetch("/api/walls");
      if (!response.ok) throw new Error("Failed to fetch content");

      const walls = await response.json();
      const allItems: ShareItem[] = [];

      // Collect all items from all walls
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

      // Perform search filtering
      let filteredResults = allItems.filter((item) => {
        const searchText =
          `${item.title || ""} ${item.url || ""}`.toLowerCase();
        return searchText.includes(trimmedQuery.toLowerCase());
      });

      // Apply content type filter
      if (filters.contentType !== "all") {
        filteredResults = filteredResults.filter((item) =>
          item.content_type.includes(filters.contentType),
        );
      }

      // Apply date range filter
      if (filters.dateRange !== "all") {
        const now = new Date();
        const filterDate = new Date();

        switch (filters.dateRange) {
          case "today":
            filterDate.setHours(0, 0, 0, 0);
            break;
          case "week":
            filterDate.setDate(now.getDate() - 7);
            break;
          case "month":
            filterDate.setMonth(now.getMonth() - 1);
            break;
          case "year":
            filterDate.setFullYear(now.getFullYear() - 1);
            break;
        }

        filteredResults = filteredResults.filter(
          (item) => new Date(item.created_at) >= filterDate,
        );
      }

      // Apply sorting
      switch (filters.sortBy) {
        case "newest":
          filteredResults.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
          break;
        case "oldest":
          filteredResults.sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
          break;
        case "title":
          filteredResults.sort((a, b) =>
            (a.title || "").localeCompare(b.title || ""),
          );
          break;
        case "relevance":
        default:
          // Simple relevance: title matches score higher
          filteredResults.sort((a, b) => {
            const aTitle = (a.title || "").toLowerCase();
            const bTitle = (b.title || "").toLowerCase();
            const queryLower = trimmedQuery.toLowerCase();

            const aScore = aTitle.includes(queryLower) ? 2 : 1;
            const bScore = bTitle.includes(queryLower) ? 2 : 1;

            return bScore - aScore;
          });
          break;
      }

      setResults(filteredResults);
      setHasSearched(true);
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, filters, recentSearches]);

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setError(null);
    searchInputRef.current?.focus();
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem("recentSearches");
  };

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="mobile-header">
        <div className="content-container py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Search</h1>
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4" />
            </Button>
          </div>

          {/* Search Input */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search content, links, or text..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-20"
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={performSearch}
                disabled={!query.trim() || loading}
                className="h-6 w-6 p-0"
              >
                {loading ? (
                  <div className="loading-spinner w-3 h-3" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <Card className="card-base">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium mb-3">Filters</h3>

                {/* Content Type Filter */}
                <div className="mb-4">
                  <label className="block text-xs text-muted-foreground mb-2">
                    Content Type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CONTENT_TYPE_FILTERS.map((filter) => (
                      <Button
                        key={filter.id}
                        variant={
                          filters.contentType === filter.id
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => updateFilter("contentType", filter.id)}
                        className="text-xs"
                      >
                        <span className="mr-1">{filter.icon}</span>
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Date Range Filter */}
                <div className="mb-4">
                  <label className="block text-xs text-muted-foreground mb-2">
                    Date Range
                  </label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => updateFilter("dateRange", e.target.value)}
                    className="input-base text-sm"
                  >
                    {DATE_RANGE_FILTERS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Options */}
                <div>
                  <label className="block text-xs text-muted-foreground mb-2">
                    Sort By
                  </label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => updateFilter("sortBy", e.target.value)}
                    className="input-base text-sm"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="content-container py-6">
        {error && (
          <Card className="card-base border-red-200 bg-red-50 mb-6">
            <CardContent className="p-4">
              <p className="text-red-700">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Recent Searches */}
        {!hasSearched && !loading && recentSearches.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Recent Searches</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearRecentSearches}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((search, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuery(search)}
                  className="justify-start"
                >
                  <Clock className="w-3 h-3 mr-2" />
                  {search}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-semibold">Search Results</h2>
                <p className="text-sm text-muted-foreground">
                  {loading
                    ? "Searching..."
                    : `${results.length} results for "${query}"`}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : results.length === 0 ? (
              <Card className="card-base">
                <CardContent className="text-center py-12">
                  <div className="text-4xl mb-4">🔍</div>
                  <h3 className="text-lg font-medium mb-2">No results found</h3>
                  <p className="text-muted-foreground">
                    Try different keywords or adjust your filters
                  </p>
                </CardContent>
              </Card>
            ) : (
              <PureOEmbedLayout
                items={results}
                viewMode="masonry"
                onItemClick={(item) =>
                  item.url && window.open(item.url, "_blank")
                }
              />
            )}
          </div>
        )}

        {/* Empty State */}
        {!hasSearched && !loading && recentSearches.length === 0 && (
          <Card className="card-base">
            <CardContent className="text-center py-16">
              <div className="text-6xl mb-6">🔍</div>
              <h2 className="text-xl font-semibold mb-4">
                Search Your Content
              </h2>
              <p className="max-w-md mx-auto mb-6 text-muted-foreground">
                Find any content you've shared across all your walls. Search by
                title, text, URL, or content type.
              </p>
              <div className="text-sm text-muted-foreground">
                <p>💡 Pro tip: Use filters to narrow down your search</p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
