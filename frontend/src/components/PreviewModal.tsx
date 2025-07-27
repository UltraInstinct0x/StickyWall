"use client";

import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Share2, Heart, Bookmark } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ShareItem | null;
}

export function PreviewModal({ isOpen, onClose, item }: PreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEmbedLoaded, setIsEmbedLoaded] = useState(false);

  useEffect(() => {
    if (!item?.html || typeof window === "undefined") return;

    // Handle Twitter/X embeds
    if (item.platform === "twitter") {
      if (!window.twttr) {
        const script = document.createElement("script");
        script.src = "https://platform.twitter.com/widgets.js";
        script.async = true;
        script.onload = () => {
          setIsEmbedLoaded(true);
        };
        document.head.appendChild(script);
      } else {
        setIsEmbedLoaded(true);
      }
    }

    // Handle Instagram embeds
    if (item.platform === "instagram") {
      if (!window.instgrm) {
        const script = document.createElement("script");
        script.src = "https://www.instagram.com/embed.js";
        script.async = true;
        script.onload = () => {
          setIsEmbedLoaded(true);
        };
        document.head.appendChild(script);
      } else {
        setIsEmbedLoaded(true);
      }
    }

    // For other platforms
    if (!["twitter", "instagram", "tiktok"].includes(item.platform || "")) {
      setIsEmbedLoaded(true);
    }
  }, [item?.html, item?.platform]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !isEmbedLoaded ||
      !containerRef.current ||
      !item?.html
    )
      return;

    // Process Twitter embeds
    if (item.platform === "twitter" && window.twttr?.widgets) {
      containerRef.current.innerHTML = item.html;
      window.twttr.widgets.load(containerRef.current).then(() => {
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

    // Process Instagram embeds
    if (item.platform === "instagram" && window.instgrm?.Embeds) {
      containerRef.current.innerHTML = item.html;
      window.instgrm.Embeds.process();
    }

    // For other rich content
    if (!["twitter", "instagram"].includes(item.platform || "")) {
      containerRef.current.innerHTML = item.html;
    }
  }, [isEmbedLoaded, item?.html, item?.platform]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPlatformColor = (platform?: string) => {
    switch (platform?.toLowerCase()) {
      case "twitter":
        return "bg-blue-500";
      case "instagram":
        return "bg-pink-500";
      case "youtube":
        return "bg-red-500";
      case "tiktok":
        return "bg-black";
      case "linkedin":
        return "bg-blue-700";
      default:
        return "bg-neutral-500";
    }
  };

  const handleShare = async () => {
    if (!item) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: item.description || item.title,
          url: item.url,
        });
      } catch (error) {
        // Fallback to clipboard
        navigator.clipboard.writeText(item.url);
      }
    } else {
      navigator.clipboard.writeText(item.url);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold leading-tight mb-2">
                {item.title || "Shared Content"}
              </DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {item.provider_name && (
                  <Badge
                    variant="secondary"
                    className={`${getPlatformColor(item.platform)} text-white`}
                  >
                    {item.provider_name}
                  </Badge>
                )}
                {item.author_name && (
                  <span>by {item.author_name}</span>
                )}
                <span>•</span>
                <time>{formatDate(item.created_at)}</time>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Rich oEmbed Content */}
          {item.html && item.oembed_type === "rich" ? (
            <div className="p-6">
              <div
                ref={containerRef}
                className="w-full max-w-2xl mx-auto"
                dangerouslySetInnerHTML={
                  typeof window === "undefined" || !isEmbedLoaded
                    ? { __html: item.html }
                    : undefined
                }
              />
            </div>
          ) : item.preview_url ? (
            <div className="relative">
              <img
                src={item.preview_url}
                alt={item.title}
                className="w-full h-auto max-h-96 object-contain bg-neutral-100"
              />
            </div>
          ) : null}

          {/* Description */}
          {item.description && (
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          )}

          {/* Metadata */}
          {item.metadata && Object.keys(item.metadata).length > 0 && (
            <div className="px-6 pb-6">
              <h4 className="text-sm font-medium mb-2">Details</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {item.metadata.content_length && (
                  <div>
                    <span className="font-medium">Size:</span>{" "}
                    {item.metadata.content_length} bytes
                  </div>
                )}
                {item.metadata.source && (
                  <div>
                    <span className="font-medium">Source:</span>{" "}
                    {item.metadata.source}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <Heart className="w-4 h-4 mr-1" />
                Like
              </Button>
              <Button variant="ghost" size="sm">
                <Bookmark className="w-4 h-4 mr-1" />
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-1" />
                Share
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => item.url && window.open(item.url, "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Open Original
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  }
}
