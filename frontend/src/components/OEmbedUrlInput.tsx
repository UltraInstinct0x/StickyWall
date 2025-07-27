'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Link,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Search,
  Globe,
  Youtube,
  Twitter,
  Instagram,
  Music
} from 'lucide-react';
import { OEmbedPreview, OEmbedData } from './OEmbedPreview';
import { debounce } from 'lodash';

export interface OEmbedUrlInputProps {
  onAdd?: (url: string, oembedData?: OEmbedData) => void;
  onCancel?: () => void;
  placeholder?: string;
  buttonText?: string;
  showPreview?: boolean;
  autoPreview?: boolean;
  className?: string;
  disabled?: boolean;
}

interface SupportedProvider {
  name: string;
  key: string;
  icon: React.ReactNode;
  example: string;
  color: string;
}

const SUPPORTED_PROVIDERS: SupportedProvider[] = [
  {
    name: 'YouTube',
    key: 'youtube',
    icon: <Youtube className="w-4 h-4" />,
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    color: 'text-red-500'
  },
  {
    name: 'Twitter/X',
    key: 'twitter',
    icon: <Twitter className="w-4 h-4" />,
    example: 'https://twitter.com/user/status/123456789',
    color: 'text-blue-500'
  },
  {
    name: 'Instagram',
    key: 'instagram',
    icon: <Instagram className="w-4 h-4" />,
    example: 'https://www.instagram.com/p/ABC123/',
    color: 'text-pink-500'
  },
  {
    name: 'SoundCloud',
    key: 'soundcloud',
    icon: <Music className="w-4 h-4" />,
    example: 'https://soundcloud.com/artist/track',
    color: 'text-orange-500'
  },
  {
    name: 'Vimeo',
    key: 'vimeo',
    icon: <Globe className="w-4 h-4" />,
    example: 'https://vimeo.com/123456789',
    color: 'text-blue-600'
  }
];

export const OEmbedUrlInput: React.FC<OEmbedUrlInputProps> = ({
  onAdd,
  onCancel,
  placeholder = "Paste a URL from YouTube, Twitter, Instagram, etc...",
  buttonText = "Add Content",
  showPreview = true,
  autoPreview = true,
  className = '',
  disabled = false
}) => {
  const [url, setUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [oembedData, setOembedData] = useState<OEmbedData | null>(null);
  const [showProviders, setShowProviders] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // Debounced URL validation
  const debouncedValidateUrl = useCallback(
    debounce(async (urlToValidate: string) => {
      if (!urlToValidate.trim()) {
        setIsSupported(null);
        setSupportError(null);
        setOembedData(null);
        return;
      }

      // Basic URL validation
      try {
        new URL(urlToValidate);
      } catch {
        setIsSupported(false);
        setSupportError('Please enter a valid URL');
        setOembedData(null);
        return;
      }

      try {
        setIsValidating(true);
        setSupportError(null);

        const response = await fetch('/api/oembed/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: urlToValidate })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        setIsSupported(result.is_supported);

        if (!result.is_supported) {
          setSupportError(result.error || 'This URL is not supported for rich previews');
          setOembedData(null);
        } else {
          setSupportError(null);
          // Set the preview data directly from the response
          if (result.oembed_data) {
            setOembedData(result.oembed_data);
          }
          // If auto preview is enabled, trigger preview update
          if (autoPreview && showPreview) {
            setPreviewKey(prev => prev + 1);
          }
        }
      } catch (error) {
        console.error('URL validation error:', error);
        setIsSupported(false);
        setSupportError('Unable to validate URL');
        setOembedData(null);
      } finally {
        setIsValidating(false);
      }
    }, 500),
    [autoPreview, showPreview]
  );

  useEffect(() => {
    debouncedValidateUrl(url);
    return () => {
      debouncedValidateUrl.cancel();
    };
  }, [url, debouncedValidateUrl]);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (!value.trim()) {
      setIsSupported(null);
      setSupportError(null);
      setOembedData(null);
    }
  };

  const handleAdd = () => {
    if (url.trim() && isSupported !== false) {
      onAdd?.(url.trim(), oembedData || undefined);
      // Reset form
      setUrl('');
      setIsSupported(null);
      setSupportError(null);
      setOembedData(null);
    }
  };

  const handleProviderExample = (provider: SupportedProvider) => {
    setUrl(provider.example);
    setShowProviders(false);
  };

  const getValidationIcon = () => {
    if (isValidating) {
      return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
    }
    if (isSupported === true) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    if (isSupported === false) {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    return <Link className="w-4 h-4 text-gray-400" />;
  };

  const getValidationMessage = () => {
    if (supportError) {
      return { type: 'error', message: supportError };
    }
    if (isSupported === true) {
      return { type: 'success', message: 'URL supports rich previews' };
    }
    if (isSupported === false && url.trim()) {
      return { type: 'warning', message: 'URL will be saved as a basic link' };
    }
    return null;
  };

  const validationMessage = getValidationMessage();

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Clean URL Input - no extra card wrapper for modal use */}
      <div className="space-y-4">
        {/* Input Field */}
        <div className="space-y-2">
          <Label htmlFor="url-input">URL</Label>
          <div className="relative">
            <Input
              id="url-input"
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="pr-10"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              {getValidationIcon()}
            </div>
          </div>
        </div>

        {/* Validation Message */}
        {validationMessage && (
          <Alert className={
            validationMessage.type === 'error' ? 'border-red-200 bg-red-50' :
            validationMessage.type === 'success' ? 'border-green-200 bg-green-50' :
            'border-yellow-200 bg-yellow-50'
          }>
            <AlertDescription className={
              validationMessage.type === 'error' ? 'text-red-700' :
              validationMessage.type === 'success' ? 'text-green-700' :
              'text-yellow-700'
            }>
              {validationMessage.message}
            </AlertDescription>
          </Alert>
        )}


        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleAdd}
            disabled={disabled || !url.trim() || isValidating}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {buttonText}
          </Button>

          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={disabled}
            >
              Cancel
            </Button>
          )}

          {url.trim() && isSupported !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(url, '_blank')}
              className="gap-1 text-sm text-gray-600"
            >
              <ExternalLink className="w-3 h-3" />
              Test
            </Button>
          )}
        </div>
      </div>

      {/* Preview */}
      {showPreview && url.trim() && isSupported === true && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Preview</Label>
          <OEmbedPreview
            key={previewKey}
            url={url}
            maxWidth={600}
            maxHeight={400}
            showMetadata={true}
            onDataLoaded={setOembedData}
            onError={(error) => {
              console.error('Preview error:', error);
              setSupportError(error);
            }}
          />
        </div>
      )}

      {/* Basic Link Preview for Unsupported URLs */}
      {url.trim() && isSupported === false && !supportError && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Link className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm">Basic Link</h4>
                <p className="text-xs text-gray-600 truncate">{url}</p>
              </div>
              <Badge variant="secondary" className="text-xs">
                Link
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OEmbedUrlInput;
