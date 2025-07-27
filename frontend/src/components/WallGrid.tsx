"use client";

import { useState, useEffect, useRef } from "react";

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

  return (
    <div className="masonry-container">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 auto-rows-max">
        {visibleItems.map((item, index) => (
          <WallItem key={item.id} item={item} index={index} />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-6 sm:py-8">
          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-warm-orange-500"></div>
        </div>
      )}

      {visibleItems.length >= items.length && items.length > 0 && (
        <div className="text-center py-6 sm:py-8 text-neutral-500 text-sm">
          ✨ All items loaded
        </div>
      )}
    </div>
  );
}

function WallItem({ item, index }: { item: ShareItem; index: number }) {
  const getItemHeight = () => {
    // Vary heights for masonry effect based on content
    const baseHeights =
      item.preview_url || item.html
        ? ["h-64", "h-72", "h-80", "h-68", "h-76"]
        : ["h-48", "h-52", "h-56", "h-60", "h-64"];
    return baseHeights[index % baseHeights.length];
  };

  const getContentTypeIcon = (contentType: string) => {
    if (contentType.includes("image")) return "🖼️";
    if (contentType.includes("video")) return "🎥";
    if (contentType.includes("pdf")) return "📄";
    if (contentType.includes("url")) return "🔗";
    if (contentType.includes("tweet") || contentType.includes("twitter"))
      return "🐦";
    if (contentType.includes("youtube")) return "▶️";
    if (contentType.includes("instagram")) return "📷";
    return "📝";
  };

  const getContentTypeBadge = (contentType: string) => {
    if (contentType.includes("youtube"))
      return { label: "YouTube", color: "bg-red-500" };
    if (contentType.includes("twitter") || contentType.includes("tweet"))
      return { label: "Twitter", color: "bg-blue-500" };
    if (contentType.includes("instagram"))
      return { label: "Instagram", color: "bg-pink-500" };
    if (contentType.includes("tiktok"))
      return { label: "TikTok", color: "bg-black" };
    if (contentType.includes("image"))
      return { label: "Image", color: "bg-warm-orange-500" };
    if (contentType.includes("video"))
      return { label: "Video", color: "bg-warm-coral-500" };
    if (contentType.includes("pdf"))
      return { label: "PDF", color: "bg-warm-amber-500" };
    return { label: "Link", color: "bg-primary" };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60),
    );

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return "Yesterday";
    if (diffInHours < 24 * 7) return `${Math.floor(diffInHours / 24)}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const contentBadge = getContentTypeBadge(item.content_type);

  return (
    <div
      className={`group relative card-interactive overflow-hidden ${getItemHeight()} cursor-pointer
        bg-gradient-to-br from-white to-neutral-50
        border border-neutral-200
        hover:border-warm-orange-300 hover:shadow-xl hover:-translate-y-1
        transition-all duration-300 ease-out`}
      onClick={() => item.url && window.open(item.url, "_blank")}
    >
      {/* Content Type Badge */}
      <div className="absolute top-3 left-3 z-10">
        <span
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${contentBadge.color}`}
        >
          <span className="mr-1">{getContentTypeIcon(item.content_type)}</span>
          {contentBadge.label}
        </span>
      </div>

      {/* Action Indicator */}
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg">
          <svg
            className="w-4 h-4 text-warm-orange-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </div>
      </div>

      {/* Rich oEmbed HTML Content */}
      {item.html && (item.oembed_type === "rich" || item.oembed_type === "video") ? (
        <RichContentEmbed html={item.html} platform={item.platform} />
      ) : item.oembed_type === "video" && !item.html && item.preview_url ? (
        <VideoThumbnailPreview 
          thumbnail={item.preview_url} 
          title={item.title} 
          platform={item.platform}
          metadata={item.metadata}
        />
      ) : item.preview_url ? (
        <div className="relative h-2/3 overflow-hidden bg-neutral-100">
          <img
            src={item.preview_url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
      ) : null}

      {/* Content Area */}
      <div
        className={`p-4 ${item.preview_url || item.html ? "h-1/3" : "h-full"} flex flex-col justify-between relative`}
      >
        {/* Main Content */}
        <div className="flex-1">
          <h3 className="font-semibold text-neutral-900 text-sm leading-tight mb-2 line-clamp-2 group-hover:text-warm-orange-700 transition-colors">
            {item.title ||
              (item.author_name
                ? `Post by ${item.author_name}`
                : "Untitled Content")}
          </h3>

          {(item.description || item.metadata?.description) && (
            <p className="text-neutral-600 text-xs leading-relaxed line-clamp-2 mb-2">
              {item.description || item.metadata.description}
            </p>
          )}

          {/* URL Display */}
          {item.url && (
            <p className="text-neutral-500 text-xs truncate mb-2">
              {item.provider_name || new URL(item.url).hostname}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <time className="text-xs text-neutral-500 font-medium">
            {formatDate(item.created_at)}
          </time>

          {/* Engagement Indicator */}
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="w-2 h-2 bg-warm-orange-400 rounded-full animate-pulse"></div>
            <span className="text-xs text-warm-orange-600 font-medium">
              View
            </span>
          </div>
        </div>
      </div>

      {/* Hover Enhancement */}
      <div className="absolute inset-0 bg-gradient-to-br from-warm-orange-500/5 to-warm-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
    </div>
  );
}

function VideoThumbnailPreview({ 
  thumbnail, 
  title, 
  platform, 
  metadata 
}: { 
  thumbnail: string; 
  title: string; 
  platform?: string; 
  metadata?: Record<string, any> 
}) {
  const getPlatformBadge = (platform?: string) => {
    switch (platform?.toLowerCase()) {
      case 'tiktok':
        return { label: 'TikTok', color: 'bg-black', icon: '🎵' };
      case 'youtube':
        return { label: 'YouTube', color: 'bg-red-500', icon: '▶️' };
      case 'vimeo':
        return { label: 'Vimeo', color: 'bg-blue-600', icon: '🎬' };
      default:
        return { label: 'Video', color: 'bg-gray-600', icon: '🎥' };
    }
  };

  const badge = getPlatformBadge(platform);

  return (
    <div className="relative h-2/3 overflow-hidden bg-neutral-100">
      <img
        src={thumbnail}
        alt={title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        loading="lazy"
      />
      
      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 group-hover:bg-opacity-40 transition-colors">
        <div className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-lg">
          <svg className="w-8 h-8 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>

      {/* Platform badge */}
      <div className="absolute top-3 left-3">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${badge.color}`}>
          <span className="mr-1">{badge.icon}</span>
          {badge.label}
        </span>
      </div>

      {/* Metadata overlay for TikTok-style content */}
      {platform === 'tiktok' && metadata && (
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <div className="bg-black bg-opacity-50 rounded-lg p-2 backdrop-blur-sm">
            <p className="text-sm font-medium line-clamp-2">{title}</p>
            {metadata.author && (
              <p className="text-xs opacity-80 mt-1">@{metadata.author}</p>
            )}
          </div>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </div>
  );
}

function RichContentEmbed({ html, platform }: { html: string; platform?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!html || typeof window === "undefined") return;

    // Handle Twitter/X specific embedding
    if (platform === "twitter") {
      // Load Twitter widgets script if not already loaded
      if (!window.twttr) {
        const script = document.createElement("script");
        script.src = "https://platform.twitter.com/widgets.js";
        script.async = true;
        script.onload = () => {
          setIsLoaded(true);
        };
        document.head.appendChild(script);
      } else {
        setIsLoaded(true);
      }
    } else {
      // For non-Twitter platforms, just mark as loaded
      setIsLoaded(true);
    }
  }, [html, platform]);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    // Clear any existing content
    containerRef.current.innerHTML = html;

    // Twitter-specific handling
    if (platform === "twitter" && isLoaded && window.twttr?.widgets) {
      window.twttr.widgets.load(containerRef.current).then(() => {
        // Styling adjustments for the embedded tweet
        const tweets = containerRef.current?.querySelectorAll(
          ".twitter-tweet-rendered",
        );
        tweets?.forEach((tweet) => {
          const iframe = tweet as HTMLIFrameElement;
          if (iframe) {
            iframe.style.margin = "0 auto";
            iframe.style.maxWidth = "100%";
          }
        });
      });
    }

    // Apply platform-specific styling improvements
    const applyPlatformStyling = () => {
      if (!containerRef.current) return;

      // Pinterest specific styling
      if (platform === "pinterest") {
        const pinterestEmbeds = containerRef.current.querySelectorAll(".pinterest-embed");
        pinterestEmbeds.forEach((embed) => {
          (embed as HTMLElement).style.maxWidth = "100%";
          (embed as HTMLElement).style.margin = "0 auto";
        });
      }

      // Instagram specific styling
      if (platform === "instagram") {
        const instagramEmbeds = containerRef.current.querySelectorAll(".instagram-embed-custom");
        instagramEmbeds.forEach((embed) => {
          (embed as HTMLElement).style.maxWidth = "100%";
          (embed as HTMLElement).style.margin = "0 auto";
        });
      }

      // Facebook specific styling
      if (platform === "facebook") {
        const facebookEmbeds = containerRef.current.querySelectorAll(".facebook-embed");
        facebookEmbeds.forEach((embed) => {
          (embed as HTMLElement).style.maxWidth = "100%";
          (embed as HTMLElement).style.margin = "0 auto";
        });
      }

      // TikTok specific styling
      if (platform === "tiktok") {
        const tiktokEmbeds = containerRef.current.querySelectorAll(".tiktok-embed-custom");
        tiktokEmbeds.forEach((embed) => {
          (embed as HTMLElement).style.maxWidth = "100%";
          (embed as HTMLElement).style.margin = "0 auto";
        });
      }

      // General rich content styling
      const allEmbeds = containerRef.current.querySelectorAll("div[style*='max-width']");
      allEmbeds.forEach((embed) => {
        const element = embed as HTMLElement;
        if (!element.style.maxWidth.includes("100%")) {
          element.style.maxWidth = "100%";
        }
      });
    };

    // Apply styling after a short delay to ensure content is rendered
    setTimeout(applyPlatformStyling, 100);
  }, [isLoaded, html, platform]);

  const getContainerClasses = () => {
    const baseClasses = "relative h-2/3 overflow-hidden bg-neutral-100";
    
    switch (platform) {
      case "twitter":
        return `${baseClasses} p-4`;
      case "pinterest":
        return `${baseClasses} p-2`;
      case "instagram":
        return `${baseClasses} p-2`;
      case "facebook":
        return `${baseClasses} p-2`;
      case "tiktok":
        return `${baseClasses} p-2`;
      default:
        return `${baseClasses} p-3`;
    }
  };

  return (
    <div className={getContainerClasses()}>
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center rich-content-container"
        dangerouslySetInnerHTML={
          typeof window === "undefined" || (platform === "twitter" && !isLoaded)
            ? { __html: html }
            : undefined
        }
        style={{
          fontSize: "14px",
          lineHeight: "1.4"
        }}
      />
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </div>
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (container?: HTMLElement) => Promise<void>;
      };
    };
  }
}
