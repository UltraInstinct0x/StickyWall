'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Globe
} from 'lucide-react';
import Image from 'next/image';

export interface OEmbedData {
  type: 'video' | 'photo' | 'link' | 'rich';
  version?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  cache_age?: number;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  url?: string;
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
}

export interface OEmbedPreviewProps {
  url: string;
  maxWidth?: number;
  maxHeight?: number;
  className?: string;
  showMetadata?: boolean;
  autoPlay?: boolean;
  onDataLoaded?: (data: OEmbedData | null) => void;
  onError?: (error: string) => void;
}

export const OEmbedPreview: React.FC<OEmbedPreviewProps> = ({
  url,
  maxWidth = 600,
  maxHeight = 400,
  className = '',
  showMetadata = true,
  autoPlay = false,
  onDataLoaded,
  onError
}) => {
  const [oembedData, setOembedData] = useState<OEmbedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    fetchOEmbedData();
  }, [url, maxWidth, maxHeight]);

  const fetchOEmbedData = async () => {
    if (!url) {
      setError('No URL provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/oembed/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          max_width: maxWidth,
          max_height: maxHeight,
          format: 'json'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.is_supported) {
        setError(result.error || 'URL not supported');
        onError?.(result.error || 'URL not supported');
        return;
      }

      if (result.oembed_data) {
        setOembedData(result.oembed_data);
        onDataLoaded?.(result.oembed_data);
      } else {
        setError('No oEmbed data available');
        onError?.('No oEmbed data available');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load oEmbed data';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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

  const renderContent = () => {
    if (!oembedData) return null;

    switch (oembedData.type) {
      case 'video':
        return (
          <div className="relative">
            {oembedData.html ? (
              <div
                className="w-full"
                dangerouslySetInnerHTML={{ __html: oembedData.html }}
              />
            ) : oembedData.thumbnail_url ? (
              <div className="relative">
                <Image
                  src={oembedData.thumbnail_url}
                  alt={oembedData.title || 'Video thumbnail'}
                  width={oembedData.thumbnail_width || maxWidth}
                  height={oembedData.thumbnail_height || maxHeight}
                  className="w-full h-auto rounded-lg"
                  onError={() => setImageError(true)}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded-lg">
                  <Play className="w-16 h-16 text-white opacity-80" />
                </div>
                {oembedData.duration && (
                  <Badge className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white">
                    {formatDuration(oembedData.duration)}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                <Video className="w-12 h-12 text-gray-400" />
              </div>
            )}
          </div>
        );

      case 'photo':
        return oembedData.url && !imageError ? (
          <Image
            src={oembedData.url}
            alt={oembedData.title || 'Image'}
            width={oembedData.width || maxWidth}
            height={oembedData.height || maxHeight}
            className="w-full h-auto rounded-lg"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-gray-400" />
          </div>
        );

      case 'rich':
        return oembedData.html ? (
          <div
            className="w-full"
            dangerouslySetInnerHTML={{ __html: oembedData.html }}
          />
        ) : oembedData.thumbnail_url && !imageError ? (
          <Image
            src={oembedData.thumbnail_url}
            alt={oembedData.title || 'Content preview'}
            width={oembedData.thumbnail_width || maxWidth}
            height={oembedData.thumbnail_height || maxHeight}
            className="w-full h-auto rounded-lg"
            onError={() => setImageError(true)}
          />
        ) : null;

      case 'link':
      default:
        return oembedData.thumbnail_url && !imageError ? (
          <Image
            src={oembedData.thumbnail_url}
            alt={oembedData.title || 'Link preview'}
            width={oembedData.thumbnail_width || maxWidth}
            height={oembedData.thumbnail_height || maxHeight}
            className="w-full h-auto rounded-lg"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
        );
    }
  };

  const renderMetadata = () => {
    if (!showMetadata || !oembedData) return null;

    return (
      <div className="space-y-3">
        {/* Title and Provider */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {oembedData.title && (
              <h3 className="font-semibold text-lg line-clamp-2 mb-1">
                {oembedData.title}
              </h3>
            )}
            {oembedData.description && (
              <p className="text-gray-600 text-sm line-clamp-3 mb-2">
                {oembedData.description}
              </p>
            )}
          </div>
          {oembedData.provider_name && (
            <div className="flex items-center gap-1 ml-3">
              {getPlatformIcon(oembedData.platform)}
              <Badge variant="secondary" className="text-xs">
                {oembedData.provider_name}
              </Badge>
            </div>
          )}
        </div>

        {/* Author */}
        {oembedData.author_name && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="w-4 h-4" />
            {oembedData.author_url ? (
              <a
                href={oembedData.author_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 hover:underline"
              >
                {oembedData.author_name}
              </a>
            ) : (
              <span>{oembedData.author_name}</span>
            )}
          </div>
        )}

        {/* Stats */}
        {(oembedData.view_count || oembedData.like_count || oembedData.comment_count || oembedData.share_count) && (
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {oembedData.view_count && (
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                <span>{formatNumber(oembedData.view_count)}</span>
              </div>
            )}
            {oembedData.like_count && (
              <div className="flex items-center gap-1">
                <Heart className="w-4 h-4" />
                <span>{formatNumber(oembedData.like_count)}</span>
              </div>
            )}
            {oembedData.comment_count && (
              <div className="flex items-center gap-1">
                <MessageCircle className="w-4 h-4" />
                <span>{formatNumber(oembedData.comment_count)}</span>
              </div>
            )}
            {oembedData.share_count && (
              <div className="flex items-center gap-1">
                <Share2 className="w-4 h-4" />
                <span>{formatNumber(oembedData.share_count)}</span>
              </div>
            )}
          </div>
        )}

        {/* Published Date */}
        {oembedData.published_at && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            <span>{new Date(oembedData.published_at).toLocaleDateString()}</span>
          </div>
        )}

        {/* Duration */}
        {oembedData.duration && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>{formatDuration(oembedData.duration)}</span>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <Card className={`w-full max-w-2xl ${className}`}>
        <CardHeader>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-48 rounded-lg mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`w-full max-w-2xl border-red-200 ${className}`}>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <ExternalLink className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Preview Not Available
            </h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(url, '_blank')}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open Link
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!oembedData) {
    return null;
  }

  return (
    <Card className={`w-full max-w-2xl ${className}`}>
      <CardContent className="p-0">
        {/* Main Content */}
        <div className="relative">
          {renderContent()}
        </div>

        {/* Metadata */}
        {showMetadata && (
          <div className="p-6">
            {renderMetadata()}

            {/* Actions */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(url, '_blank')}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                View Original
              </Button>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>via {oembedData.provider_name || 'Web'}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OEmbedPreview;
