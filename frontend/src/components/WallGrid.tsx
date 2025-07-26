"use client";

import { useState, useEffect } from "react";

interface ShareItem {
  id: number;
  title: string;
  url: string;
  content_type: string;
  preview_url?: string;
  created_at: string;
  metadata: Record<string, any>;
}

interface WallGridProps {
  items: ShareItem[];
}

export function WallGrid({ items }: WallGridProps) {
  const [visibleItems, setVisibleItems] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Initial load
    setVisibleItems(items.slice(0, 20));
  }, [items]);

  const loadMore = () => {
    if (loading) return;

    setLoading(true);
    setTimeout(() => {
      const currentLength = visibleItems.length;
      const newItems = items.slice(currentLength, currentLength + 20);
      setVisibleItems((prev) => [...prev, ...newItems]);
      setLoading(false);
    }, 500);
  };

  // Scroll detection for infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      if (
        scrollPosition >= documentHeight - 1000 &&
        !loading &&
        visibleItems.length < items.length
      ) {
        loadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loading, visibleItems.length, items.length]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-lg mb-4">
          No items in this wall yet
        </div>
        <p className="text-gray-500">Share some content to get started!</p>
      </div>
    );
  }

  return (
    <div className="masonry-container">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max">
        {visibleItems.map((item, index) => (
          <WallItem key={item.id} item={item} index={index} />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      )}

      {visibleItems.length >= items.length && items.length > 0 && (
        <div className="text-center py-8 text-gray-500">All items loaded</div>
      )}
    </div>
  );
}

function WallItem({ item, index }: { item: ShareItem; index: number }) {
  const getItemHeight = () => {
    // Vary heights for masonry effect
    const heights = ["h-48", "h-64", "h-52", "h-72", "h-56"];
    return heights[index % heights.length];
  };

  const getContentTypeIcon = (contentType: string) => {
    if (contentType.includes("image")) return "🖼️";
    if (contentType.includes("video")) return "🎥";
    if (contentType.includes("pdf")) return "📄";
    if (contentType.includes("url")) return "🔗";
    return "📝";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={`masonry-item bg-gray-800/50 backdrop-blur-sm rounded-lg overflow-hidden ${getItemHeight()} group cursor-pointer border border-gray-700/50 hover:border-purple-500/50 transition-all`}
      onClick={() => item.url && window.open(item.url, "_blank")}
    >
      {item.preview_url && (
        <div className="h-2/3 overflow-hidden">
          <img
            src={item.preview_url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
      )}

      <div
        className={`p-4 ${item.preview_url ? "h-1/3" : "h-full"} flex flex-col justify-between`}
      >
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">
              {getContentTypeIcon(item.content_type)}
            </span>
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              {item.content_type}
            </span>
          </div>

          <h3 className="text-white font-medium text-sm line-clamp-2 mb-2">
            {item.title || "Untitled"}
          </h3>

          {item.metadata?.description && (
            <p className="text-gray-400 text-xs line-clamp-2 mb-2">
              {item.metadata.description}
            </p>
          )}
        </div>

        <div className="flex justify-between items-center">
          <time className="text-xs text-gray-500">
            {formatDate(item.created_at)}
          </time>

          {item.url && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-purple-400 text-xs">Open →</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
