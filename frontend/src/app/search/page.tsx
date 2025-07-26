"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
      // In a real app, this would be a dedicated search API
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
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-gray-800">
        <div className="px-4 py-4">
          <div className="flex items-center space-x-4 mb-4">
            <h1 className="text-2xl font-bold">Search</h1>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`
                p-2 rounded-lg transition-all
                ${showFilters ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}
              `}
            >
              ⚙️
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search content, links, or text..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 pr-20 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
              {query && (
                <button
                  onClick={clearSearch}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              )}
              <button
                onClick={performSearch}
                className="text-gray-400 hover:text-purple-400 transition-colors"
                disabled={!query.trim() || loading}
              >
                {loading ? "⏳" : "🔍"}
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Filters
              </h3>

              {/* Content Type Filter */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">
                  Content Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_TYPE_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => updateFilter("contentType", filter.id)}
                      className={`
                        px-3 py-1 rounded-full text-xs flex items-center space-x-1 transition-all
                        ${
                          filters.contentType === filter.id
                            ? "bg-purple-600 text-white"
                            : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }
                      `}
                    >
                      <span>{filter.icon}</span>
                      <span>{filter.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range Filter */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">
                  Date Range
                </label>
                <select
                  value={filters.dateRange}
                  onChange={(e) => updateFilter("dateRange", e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white"
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
                <label className="block text-xs text-gray-400 mb-2">
                  Sort By
                </label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => updateFilter("sortBy", e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="px-4 py-6">
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-100 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Recent Searches */}
        {!hasSearched && !loading && recentSearches.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                Recent Searches
              </h2>
              <button
                onClick={clearRecentSearches}
                className="text-sm text-gray-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  onClick={() => setQuery(search)}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-all"
                >
                  🕒 {search}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Search Results
                </h2>
                <p className="text-sm text-gray-400">
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
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-medium mb-2">No results found</h3>
                <p>Try different keywords or adjust your filters</p>
              </div>
            ) : (
              <WallGrid items={results} />
            )}
          </div>
        )}

        {/* Empty State */}
        {!hasSearched && !loading && recentSearches.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            <div className="text-6xl mb-6">🔍</div>
            <h2 className="text-xl font-semibold mb-4 text-white">
              Search Your Content
            </h2>
            <p className="max-w-md mx-auto mb-6">
              Find any content you've shared across all your walls. Search by
              title, text, URL, or content type.
            </p>
            <div className="text-sm text-gray-500">
              <p>💡 Pro tip: Use filters to narrow down your search</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
