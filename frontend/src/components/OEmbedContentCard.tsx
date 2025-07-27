'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ExternalLink,
  Play,
  Image as ImageIcon,
  FileText,
  Music,
  Video,
  Calendar,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  User,
  Globe,
  MoreVertical,
  Trash2,
  Edit3,
  Copy
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Image from 'next/image';

export interface OEmbedContentData {
  id: number;
  share_item_id: number;
  oembed_type: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  content_url?: string;
  width?: number;
  height?: number;
  html?: string;
  platform?: string;
  platform_id?: string;
  description?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  published_at?: string;
  local_thumbnail_path?: string;
  local_content_path?: string;
  extraction_status: string;
  created_at: string;
  updated_at: string;
}

export interface ShareItemData {
  id: number;
  title?: string;
  text?: string;
  url?: string;
  content_type?: string;
  has_oembed: boolean;
  oembed_processed: boolean;
  created_at: string;
  updated_at: string;
  oembed_data?: OEmbedContentData;
}

export interface OEmbedContentCardProps {
  shareItem: ShareItemData;
  onEdit?: (item: ShareItemData) => void;
  onDelete?: (item: ShareItemData) => void;
  onShare?: (item: ShareItemData) => void;
  className?: string;
  showActions?: boolean;
  compact?: boolean;
}

export const OEmbedContentCard: React.FC<OEmbedContentCardProps> = ({
  shareItem,
  onEdit,
  onDelete,
  onShare,
  className = '',
  showActions = true,
  compact = false
}) => {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const oembedData = shareItem.oembed_data;
  const hasOEmbed = shareItem.has_oembed && oembedData;

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getPlatformIcon = (platform?: string) => {
    switch (platform?.toLowerCase()) {
      case 'youtube':
        return <Video className="w-4 h-4 text-red-500" />;
      case 'twitter':
      case 'x':
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case 'instagram':
        return <ImageIcon className="w-4 h-4 text-pink-500" />;
      case 'soundcloud':
        return <Music className="w-4 h-4 text-orange-500" />;
      case 'vimeo':
        return <Video className="w-4 h-4 text-blue-600" />;
      case 'tiktok':
        return <Video className="w-4 h-4 text-black" />;
      default:
        return <Globe className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPlatformColor = (platform?: string) => {
    switch (platform?.toLowerCase()) {
      case 'youtube':
        return 'bg-red-50 border-red-200';
      case 'twitter':
      case 'x':
        return 'bg-blue-50 border-blue-200';
      case 'instagram':
        return 'bg-pink-50 border-pink-200';
      case 'soundcloud':
        return 'bg-orange-50 border-orange-200';
      case 'vimeo':
        return 'bg-blue-50 border-blue-200';
      case 'tiktok':
        return 'bg-gray-50 border-gray-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const handleCopyUrl = async () => {
    if (shareItem.url) {
      try {
        await navigator.clipboard.writeText(shareItem.url);
        // You could add a toast notification here
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    }
  };

  const renderThumbnail = () => {
    const thumbnailUrl = oembedData?.local_thumbnail_path
      ? `/api/files/${oembedData.local_thumbnail_path}`
      : oembedData?.thumbnail_url;

    if (!thumbnailUrl || imageError) {
      return (
        <div className={`w-full ${compact ? 'h-32' : 'h-48'} bg-gray-100 rounded-lg flex items-center justify-center`}>
          {oembedData?.oembed_type === 'video' ? (
            <Video className="w-8 h-8 text-gray-400" />
          ) : oembedData?.oembed_type === 'photo' ? (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          ) : (
            <FileText className="w-8 h-8 text-gray-400" />
          )}
        </div>
      );
    }

    return (
      <div className="relative group">
        <Image
          src={thumbnailUrl}
          alt={oembedData?.title || shareItem.title || 'Content thumbnail'}
          width={oembedData?.thumbnail_width || 400}
          height={oembedData?.thumbnail_height || 300}
          className={`w-full ${compact ? 'h-32' : 'h-48'} object-cover rounded-lg`}
          onError={() => setImageError(true)}
        />

        {/* Play button overlay for videos */}
        {oembedData?.oembed_type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg group-hover:bg-opacity-30 transition-colors">
            <div className="w-12 h-12 bg-black bg-opacity-70 rounded-full flex items-center justify-center">
              <Play className="w-6 h-6 text-white ml-1" />
            </div>
          </div>
        )}

        {/* Duration badge for videos */}
        {oembedData?.duration && (
          <Badge className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs">
            {formatDuration(oembedData.duration)}
          </Badge>
        )}

        {/* Platform badge */}
        {oembedData?.provider_name && (
          <Badge
            className={`absolute top-2 left-2 ${getPlatformColor(oembedData.platform)} text-xs`}
            variant="secondary"
          >
            <span className="flex items-center gap-1">
              {getPlatformIcon(oembedData.platform)}
              {oembedData.provider_name}
            </span>
          </Badge>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (!hasOEmbed) {
      // Fallback for items without oEmbed data
      return (
        <div className="space-y-3">
          <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <h3 className="font-semibold text-base line-clamp-2">
              {shareItem.title || 'Untitled'}
            </h3>
            {shareItem.text && (
              <p className="text-gray-600 text-sm line-clamp-2 mt-1">
                {shareItem.text}
              </p>
            )}
            {shareItem.url && (
              <p className="text-blue-600 text-xs mt-2 truncate">
                {shareItem.url}
              </p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {/* Thumbnail */}
        <button
          onClick={() => shareItem.url && window.open(shareItem.url, '_blank')}
          className="w-full text-left"
        >
          {renderThumbnail()}
        </button>

        {/* Content Info */}
        <div className="space-y-2">
          {/* Title */}
          <h3 className={`font-semibold ${compact ? 'text-sm' : 'text-base'} line-clamp-2`}>
            {oembedData?.title || shareItem.title || 'Untitled'}
          </h3>

          {/* Description */}
          {oembedData?.description && !compact && (
            <p className="text-gray-600 text-sm line-clamp-2">
              {oembedData.description}
            </p>
          )}

          {/* Author */}
          {oembedData?.author_name && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <User className="w-3 h-3" />
              <span className="truncate">{oembedData.author_name}</span>
            </div>
          )}

          {/* Stats */}
          {!compact && (oembedData?.view_count || oembedData?.like_count) && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {oembedData.view_count && (
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  <span>{formatNumber(oembedData.view_count)}</span>
                </div>
              )}
              {oembedData.like_count && (
                <div className="flex items-center gap-1">
                  <Heart className="w-3 h-3" />
                  <span>{formatNumber(oembedData.like_count)}</span>
                </div>
              )}
              {oembedData.comment_count && (
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  <span>{formatNumber(oembedData.comment_count)}</span>
                </div>
              )}
            </div>
          )}

          {/* Date */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{new Date(shareItem.created_at).toLocaleDateString()}</span>
            </div>

            {oembedData?.published_at && (
              <span>
                Published {new Date(oembedData.published_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Show skeleton while oEmbed is processing
  if (shareItem.url && !shareItem.oembed_processed) {
    return (
      <Card className={`${className} animate-pulse`}>
        <CardContent className="p-4">
          <div className="space-y-3">
            <Skeleton className="w-full h-48 rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`group transition-all duration-200 hover:shadow-lg ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-4">
        {/* Actions Menu */}
        {showActions && (
          <div className={`absolute top-2 right-2 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 bg-white bg-opacity-90 hover:bg-opacity-100">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {shareItem.url && (
                  <>
                    <DropdownMenuItem onClick={() => window.open(shareItem.url, '_blank')}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Original
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyUrl}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy URL
                    </DropdownMenuItem>
                  </>
                )}

                {onShare && (
                  <DropdownMenuItem onClick={() => onShare(shareItem)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                )}

                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(shareItem)}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}

                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(shareItem)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Main Content */}
        {renderContent()}
      </CardContent>
    </Card>
  );
};

export default OEmbedContentCard;
