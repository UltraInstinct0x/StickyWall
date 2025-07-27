"use client";

import { useState } from "react";
import { PureOEmbedDisplay } from "./PureOEmbedDisplay";

interface ShareItem {
  id: number;
  title: string;
  url: string;
  content_type: string;
  preview_url?: string;
  created_at: string;
  metadata: Record<string, any>;
  // oEmbed fields
  oembed_type?: string;
  author_name?: string;
  provider_name?: string;
  description?: string;
  html?: string;
  platform?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

interface PureOEmbedLayoutProps {
  items: ShareItem[];
  viewMode?: "masonry" | "list";
  onItemClick?: (item: ShareItem) => void;
  onViewInWall?: (item: ShareItem) => void;
  onViewSource?: (url: string) => void;
}

export function PureOEmbedLayout({
  items,
  viewMode = "masonry",
  onItemClick,
  onViewInWall,
  onViewSource,
}: PureOEmbedLayoutProps) {
  const handleItemClick = (item: ShareItem) => {
    if (onItemClick) {
      onItemClick(item);
    } else if (item.url) {
      window.open(item.url, "_blank");
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mb-6">
          <div className="w-24 h-24 mx-auto bg-warm-peach rounded-full flex items-center justify-center mb-4">
            <span className="text-4xl">✨</span>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-neutral-800 mb-2">
          Ready to start collecting?
        </h3>
        <p className="text-neutral-600 max-w-md mx-auto leading-relaxed">
          Your wall is waiting for its first piece of content. Share a link
          above to get started!
        </p>
      </div>
    );
  }

  // Masonry layout for optimal spacing
  if (viewMode === "masonry") {
    return (
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-2 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="break-inside-avoid mb-2">
            <PureOEmbedDisplay
              item={item}
              onClick={() => handleItemClick(item)}
              onViewInWall={onViewInWall}
              onViewSource={onViewSource}
            />
          </div>
        ))}
      </div>
    );
  }

  // List layout with consistent width
  if (viewMode === "list") {
    return (
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="w-full max-w-xl mx-auto">
            <PureOEmbedDisplay
              item={item}
              onClick={() => handleItemClick(item)}
              onViewInWall={onViewInWall}
              onViewSource={onViewSource}
              className="list-view-item"
            />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
