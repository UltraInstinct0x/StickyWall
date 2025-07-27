"use client";

import { useEffect, useRef, useState } from "react";
import { EngagementBar } from "./EngagementBar";

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

interface PureOEmbedDisplayProps {
  item: ShareItem;
  className?: string;
  onClick?: () => void;
  onViewInWall?: (item: ShareItem) => void;
  onViewSource?: (url: string) => void;
}

export function PureOEmbedDisplay({
  item,
  className = "",
  onClick,
  onViewInWall,
  onViewSource,
}: PureOEmbedDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Engagement handlers
  const handleClick = () => {
    // Changed: Now opens in digital wall instead of external link
    if (onViewInWall) {
      onViewInWall(item);
    } else if (onClick) {
      onClick();
    }
  };

  const handleViewSource = (url: string) => {
    if (onViewSource) {
      onViewSource(url);
    } else {
      window.open(url, "_blank");
    }
  };

  const handleLike = (itemId: number) => {
    console.log("Like item:", itemId);
    // TODO: Implement like functionality
  };

  const handleRepost = (itemId: number) => {
    console.log("Repost item:", itemId);
    // TODO: Implement repost functionality
  };

  const handleBookmark = (itemId: number) => {
    console.log("Bookmark item:", itemId);
    // TODO: Implement bookmark functionality
  };

  const handleComment = (itemId: number) => {
    console.log("Comment on item:", itemId);
    // TODO: Implement comment functionality
  };

  const handleShare = (itemId: number) => {
    console.log("Share item:", itemId);
    // TODO: Implement share functionality
  };

  useEffect(() => {
    if (!item.html || typeof window === "undefined") return;

    // Handle Twitter/X embeds
    if (item.platform === "twitter") {
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
    }

    // Handle Instagram embeds
    if (item.platform === "instagram") {
      if (!window.instgrm) {
        const script = document.createElement("script");
        script.src = "https://www.instagram.com/embed.js";
        script.async = true;
        script.onload = () => {
          setIsLoaded(true);
        };
        document.head.appendChild(script);
      } else {
        setIsLoaded(true);
      }
    }

    // Handle Reddit embeds
    if (item.platform === "reddit") {
      // Check if Reddit embed script is already loaded
      const existingScript = document.querySelector(
        'script[src*="embed.reddit.com"]',
      );
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://embed.reddit.com/widgets.js";
        script.async = true;
        script.charset = "UTF-8";
        script.onload = () => {
          setIsLoaded(true);
        };
        script.onerror = () => {
          console.error("Failed to load Reddit embed script");
          setIsLoaded(true); // Still mark as loaded to show fallback
        };
        document.head.appendChild(script);
      } else {
        setIsLoaded(true);
      }
    }

    // Handle TikTok embeds
    if (item.platform === "tiktok") {
      if (!window.tiktokEmbed) {
        const script = document.createElement("script");
        script.src = "https://www.tiktok.com/embed.js";
        script.async = true;
        script.onload = () => {
          setIsLoaded(true);
        };
        document.head.appendChild(script);
      } else {
        setIsLoaded(true);
      }
    }

    // Handle Pinterest embeds (custom only, no script needed)
    if (item.platform === "pinterest") {
      setIsLoaded(true);
    }

    // For other platforms or rich content, mark as loaded immediately
    if (
      !["twitter", "instagram", "reddit", "tiktok", "pinterest"].includes(
        item.platform || "",
      )
    ) {
      setIsLoaded(true);
    }
  }, [item.html, item.platform]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !isLoaded ||
      !containerRef.current ||
      !item.html
    )
      return;

    // Process Twitter embeds
    if (item.platform === "twitter" && window.twttr?.widgets) {
      containerRef.current.innerHTML = item.html;
      window.twttr.widgets.load(containerRef.current).then(() => {
        // Style adjustments for embedded tweets
        const tweets = containerRef.current?.querySelectorAll(
          ".twitter-tweet-rendered",
        );
        tweets?.forEach((tweet) => {
          const iframe = tweet as HTMLIFrameElement;
          if (iframe) {
            iframe.style.margin = "0";
            iframe.style.maxWidth = "100%";
            iframe.style.borderRadius = "8px";
          }
        });
      });
    }

    // Process Instagram embeds
    if (item.platform === "instagram" && window.instgrm?.Embeds) {
      containerRef.current.innerHTML = item.html;
      window.instgrm.Embeds.process();
    }

    // Process Reddit embeds
    if (item.platform === "reddit") {
      containerRef.current.innerHTML = item.html;

      // Enhanced Reddit embed processing
      setTimeout(() => {
        const blockquotes =
          containerRef.current?.querySelectorAll(".reddit-embed-bq");
        blockquotes?.forEach((blockquote) => {
          // Add enhanced styling to the blockquote
          const element = blockquote as HTMLElement;
          element.style.cssText = `
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 16px;
            background: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            max-width: 500px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            min-height: 120px;
            position: relative;
          `;

          // Add Reddit branding
          if (!element.querySelector(".reddit-branding")) {
            const branding = document.createElement("div");
            branding.className = "reddit-branding";
            branding.style.cssText = `
              position: absolute;
              top: 8px;
              right: 12px;
              background: #ff4500;
              color: white;
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: bold;
            `;
            branding.textContent = "Reddit";
            element.appendChild(branding);
          }

          // Style links within the embed
          const links = element.querySelectorAll("a");
          links.forEach((link) => {
            const linkElement = link as HTMLElement;
            linkElement.style.cssText = `
              color: #0079d3;
              text-decoration: none;
              font-weight: 500;
            `;
            linkElement.addEventListener("mouseover", () => {
              linkElement.style.textDecoration = "underline";
            });
            linkElement.addEventListener("mouseout", () => {
              linkElement.style.textDecoration = "none";
            });
          });

          // Try to load Reddit iframe if script is available
          if (!element.querySelector("iframe")) {
            const script = document.createElement("script");
            script.src = "https://embed.reddit.com/widgets.js";
            script.async = true;
            script.charset = "UTF-8";
            script.onload = () => {
              // Reddit script loaded, iframe should appear automatically
            };
            document.head.appendChild(script);
          }
        });
      }, 100);
    }

    // Process TikTok embeds
    if (item.platform === "tiktok") {
      containerRef.current.innerHTML = item.html;
      if (window.tiktokEmbed?.lib?.render) {
        window.tiktokEmbed.lib.render(containerRef.current);
      }
    }

    // Process Pinterest embeds (custom HTML only)
    if (item.platform === "pinterest") {
      containerRef.current.innerHTML = item.html;
    }

    // For other rich content, just set the HTML
    if (
      !["twitter", "instagram", "reddit", "tiktok", "pinterest"].includes(
        item.platform || "",
      )
    ) {
      containerRef.current.innerHTML = item.html;
    }
  }, [isLoaded, item.html, item.platform]);

  // Fallback for non-oEmbed content
  if (
    !item.html ||
    (item.oembed_type !== "rich" && item.oembed_type !== "video")
  ) {
    return (
      <div className={`pure-embed-fallback cursor-pointer group ${className || ""}`}>
        <div onClick={handleClick}>
          {item.preview_url ? (
            <img
              src={item.preview_url}
              alt={item.title}
              className="w-full h-auto rounded-lg"
              loading="lazy"
            />
          ) : (
            <div
              className="p-4 border border-neutral-200 rounded-lg bg-neutral-50 hover:bg-neutral-100 transition-colors w-full max-w-full"
              style={{
                maxWidth: "600px",
                margin: "0 auto",
                boxSizing: "border-box",
              }}
            >
              <h3 className="font-medium text-sm mb-1">{item.title}</h3>
              {item.description && (
                <p className="text-xs text-neutral-600 mb-2">
                  {item.description}
                </p>
              )}
              <p className="text-xs text-neutral-500">
                {item.provider_name || new URL(item.url).hostname}
              </p>
            </div>
          )}
        </div>
        <EngagementBar
          item={item}
          onLike={handleLike}
          onRepost={handleRepost}
          onBookmark={handleBookmark}
          onComment={handleComment}
          onShare={handleShare}
          onViewSource={handleViewSource}
        />
      </div>
    );
  }

  // For video embeds (YouTube, Vimeo), render iframe directly
  if (item.oembed_type === "video") {
    return (
      <div className={`pure-embed-container cursor-pointer group ${className || ""}`}>
        <div onClick={handleClick}>
          <div
            className="w-full video-embed-container"
            dangerouslySetInnerHTML={{ __html: item.html }}
          />
        </div>
        <EngagementBar
          item={item}
          onLike={handleLike}
          onRepost={handleRepost}
          onBookmark={handleBookmark}
          onComment={handleComment}
          onShare={handleShare}
          onViewSource={handleViewSource}
        />
      </div>
    );
  }

  return (
    <div className={`pure-embed-container cursor-pointer group ${className || ""}`}>
      <div onClick={handleClick}>
        <div
          ref={containerRef}
          className={`w-full ${className?.includes("list-view-item") ? "list-view-content" : ""}`}
          dangerouslySetInnerHTML={
            typeof window === "undefined" || !isLoaded
              ? { __html: item.html }
              : undefined
          }
        />
      </div>
      <EngagementBar
        item={item}
        onLike={handleLike}
        onRepost={handleRepost}
        onBookmark={handleBookmark}
        onComment={handleComment}
        onShare={handleShare}
        onViewSource={handleViewSource}
      />
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
    instgrm?: {
      Embeds: {
        process: () => void;
      };
    };
    rembeddit?: {
      createEmbedIframe?: (element: Element) => void;
    };
    tiktokEmbed?: {
      lib: {
        render: (container: HTMLElement) => void;
      };
    };
  }
}
