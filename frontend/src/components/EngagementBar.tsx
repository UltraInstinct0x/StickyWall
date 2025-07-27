"use client";

import React, { useState } from "react";
import { Heart, Repeat2, Bookmark, MessageCircle, MoreHorizontal } from "lucide-react";

interface EngagementBarProps {
  item: {
    id: number;
    url: string;
    platform?: string;
  };
  onLike?: (itemId: number) => void;
  onRepost?: (itemId: number) => void;
  onBookmark?: (itemId: number) => void;
  onComment?: (itemId: number) => void;
  onShare?: (itemId: number) => void;
  onViewSource?: (url: string) => void;
}

export function EngagementBar({
  item,
  onLike,
  onRepost,
  onBookmark,
  onComment,
  onShare,
  onViewSource,
}: EngagementBarProps) {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLiked(!liked);
    onLike?.(item.id);
  };

  const handleRepost = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRepost?.(item.id);
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarked(!bookmarked);
    onBookmark?.(item.id);
  };

  const handleComment = (e: React.MouseEvent) => {
    e.stopPropagation();
    onComment?.(item.id);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onShare?.(item.id);
  };

  const handleViewSource = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewSource?.(item.url);
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  return (
    <div className="mt-1 transition-all duration-200 group-hover:mb-1">
      {/* Compact bar that's always visible */}
      <div className="h-6 group-hover:h-10 overflow-hidden transition-all duration-200 bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-3 py-1.5 h-10">
          {/* Main engagement buttons */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleLike}
              className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                liked ? "text-red-500 bg-red-50" : "text-gray-600 hover:text-red-500 hover:bg-red-50"
              }`}
              title="Like"
            >
              <Heart className={`w-4 h-4 ${liked ? "fill-current" : ""}`} />
            </button>
            
            <button
              onClick={handleRepost}
              className="flex items-center justify-center w-6 h-6 rounded-full text-gray-600 hover:text-green-600 hover:bg-green-50 transition-colors"
              title="Repost"
            >
              <Repeat2 className="w-4 h-4" />
            </button>
            
            <button
              onClick={handleBookmark}
              className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                bookmarked ? "text-blue-500 bg-blue-50" : "text-gray-600 hover:text-blue-500 hover:bg-blue-50"
              }`}
              title="Save"
            >
              <Bookmark className={`w-4 h-4 ${bookmarked ? "fill-current" : ""}`} />
            </button>
            
            <button
              onClick={handleComment}
              className="flex items-center justify-center w-6 h-6 rounded-full text-gray-600 hover:text-purple-600 hover:bg-purple-50 transition-colors"
              title="Comment"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
          </div>
          
          {/* 3-dot menu */}
          <div className="relative">
            <button
              onClick={handleMenuToggle}
              className="flex items-center justify-center w-6 h-6 rounded-full text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              title="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[120px]">
                <button
                  onClick={handleShare}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Share
                </button>
                {item.url && (
                  <button
                    onClick={handleViewSource}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    View on {item.platform || 'source'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}