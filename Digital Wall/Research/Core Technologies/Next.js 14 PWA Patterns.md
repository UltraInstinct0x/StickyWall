# [[Next.js 14 PWA Patterns]] - Advanced Implementation

## Overview & Core Concepts

**Next.js 14** provides advanced patterns for building [[Progressive Web Apps]] with the [[Digital Wall]] project. This document covers server-side rendering optimization, app router integration, and advanced PWA features using the latest Next.js capabilities.

### Key Features in Next.js 14
- **[[App Router]]**: File-based routing with layouts and server components
- **[[Server Actions]]**: Direct server-side function calls from components
- **[[Streaming SSR]]**: Progressive page rendering for better performance
- **[[React Server Components]]**: Zero-bundle server-rendered components
- **[[Edge Runtime]]**: Faster cold starts and global distribution

## Technical Deep Dive

### PWA Configuration with App Router

```typescript
// next.config.js - Next.js 14 PWA Configuration
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  sw: '/sw.js',
  buildExcludes: [/middleware-manifest.json$/],
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.digitalwall\.app/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        },
        networkTimeoutSeconds: 10
      }
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 1000,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
        }
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
    serverActions: true,
    serverComponentsExternalPackages: ['@anthropic-ai/sdk']
  },
  images: {
    domains: ['r2.digitalwall.app', 'images.unsplash.com'],
    formats: ['image/webp', 'image/avif']
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff'
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY'
        }
      ]
    }
  ]
};

module.exports = withPWA(nextConfig);
```

### App Router Layout Integration

```typescript
// app/layout.tsx - Root layout with PWA features
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { PWAProvider } from '@/components/pwa-provider';
import { ShareHandler } from '@/components/share-handler';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | Digital Wall',
    default: 'Digital Wall - Your Personal Content Curator'
  },
  description: 'Share and curate content from anywhere with AI-powered organization',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Digital Wall'
  },
  formatDetection: {
    telephone: false
  },
  openGraph: {
    type: 'website',
    title: 'Digital Wall',
    description: 'Share and curate content from anywhere',
    images: ['/og-image.png']
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' }
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <PWAProvider>
          <ShareHandler />
          <main className="min-h-screen">
            {children}
          </main>
        </PWAProvider>
      </body>
    </html>
  );
}
```

### Server Actions for Share Processing

```typescript
// app/actions/share.ts - Server Actions for share handling
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ContentProcessor } from '@/lib/content-processor';
import { getUserWall } from '@/lib/wall-storage';
import { z } from 'zod';

const ShareSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  userId: z.string().optional()
});

export async function processShareAction(formData: FormData) {
  try {
    const rawData = {
      url: formData.get('url'),
      text: formData.get('text'),
      title: formData.get('title'),
      userId: formData.get('userId')
    };

    const validatedData = ShareSchema.parse(rawData);
    
    if (!validatedData.url && !validatedData.text) {
      throw new Error('No content to share');
    }

    // Process with AI in server action
    const processedContent = await ContentProcessor.analyze({
      url: validatedData.url,
      text: validatedData.text,
      title: validatedData.title
    });

    // Get user's wall (anonymous if no userId)
    const wall = await getUserWall(validatedData.userId);
    
    // Add to wall
    await wall.addItem(processedContent);

    // Revalidate the wall page to show new content
    revalidatePath('/wall');
    
    return { success: true, itemId: processedContent.id };
    
  } catch (error) {
    console.error('Share processing error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Processing failed' 
    };
  }
}

export async function installPromptAction() {
  'use server';
  
  // Track installation prompt server-side
  await fetch(process.env.ANALYTICS_API + '/pwa-install-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      source: 'server_action'
    })
  });
}
```

### Advanced Server Components Pattern

```typescript
// app/wall/page.tsx - Server Component with streaming
import { Suspense } from 'react';
import { WallItems } from '@/components/wall-items';
import { WallSkeleton } from '@/components/wall-skeleton';
import { ShareFab } from '@/components/share-fab';
import { getUserWallData } from '@/lib/wall-data';

interface WallPageProps {
  searchParams: { share?: string; filter?: string };
}

export default async function WallPage({ searchParams }: WallPageProps) {
  // Server-side data fetching
  const wallDataPromise = getUserWallData({
    filter: searchParams.filter
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Your Digital Wall</h1>
        {searchParams.share === 'success' && (
          <div className="mt-4 p-4 bg-green-100 text-green-800 rounded-lg">
            Content successfully added to your wall!
          </div>
        )}
      </header>

      <Suspense fallback={<WallSkeleton />}>
        <WallItems dataPromise={wallDataPromise} />
      </Suspense>

      <ShareFab />
    </div>
  );
}

// app/components/wall-items.tsx - Client component with server data
'use client';

import { use } from 'react';
import { WallItem } from './wall-item';
import type { WallData } from '@/types/wall';

interface WallItemsProps {
  dataPromise: Promise<WallData>;
}

export function WallItems({ dataPromise }: WallItemsProps) {
  const wallData = use(dataPromise);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {wallData.items.map((item) => (
        <WallItem key={item.id} item={item} />
      ))}
    </div>
  );
}
```

## Development Patterns

### Progressive Enhancement with Server Components

```typescript
// components/pwa-provider.tsx - Progressive PWA features
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { installPromptAction } from '@/app/actions/share';

interface PWAContextType {
  isInstallable: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<boolean>;
}

const PWAContext = createContext<PWAContextType | null>(null);

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Check if already installed
    setIsInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator) ||
      document.referrer.includes('android-app://')
    );

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      // Show install prompt
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;

      if (result.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        
        // Track installation server-side
        await installPromptAction();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Install prompt failed:', error);
      return false;
    }
  };

  return (
    <PWAContext.Provider value={{ isInstallable, isInstalled, promptInstall }}>
      {children}
    </PWAContext.Provider>
  );
}

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within PWAProvider');
  }
  return context;
};
```

### Edge Runtime Share Handler

```typescript
// app/api/share/route.ts - Edge Runtime implementation
import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const headersList = headers();
    const userAgent = headersList.get('user-agent') || '';
    
    // Parse form data efficiently on Edge
    const formData = await request.formData();
    
    const shareData = {
      url: formData.get('url') as string,
      text: formData.get('text') as string,
      title: formData.get('title') as string,
      userAgent,
      timestamp: Date.now()
    };

    // Quick validation
    if (!shareData.url && !shareData.text) {
      return new Response('No content provided', { status: 400 });
    }

    // Process on Edge for fastest response
    const quickResult = await processShareOnEdge(shareData);

    // Queue for full AI processing
    await queueForFullProcessing(shareData);

    // Fast redirect for better UX
    return Response.redirect(
      new URL(`/wall?share=success&id=${quickResult.id}`, request.url),
      302
    );

  } catch (error) {
    console.error('Edge share processing error:', error);
    return Response.redirect(
      new URL('/wall?share=error', request.url),
      302
    );
  }
}

async function processShareOnEdge(shareData: any) {
  // Basic processing for immediate response
  const id = crypto.randomUUID();
  
  // Store basic item for immediate display
  await fetch(process.env.EDGE_STORAGE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      ...shareData,
      status: 'processing'
    })
  });

  return { id };
}

async function queueForFullProcessing(shareData: any) {
  // Queue for full AI processing in background
  await fetch(process.env.QUEUE_API + '/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'full_share_processing',
      data: shareData
    })
  });
}
```

### Optimistic Updates Pattern

```typescript
// components/wall-item.tsx - Optimistic UI updates
'use client';

import { useOptimistic, useTransition } from 'react';
import { likeItem, removeItem } from '@/app/actions/wall';
import type { WallItemType } from '@/types/wall';

interface WallItemProps {
  item: WallItemType;
}

export function WallItem({ item }: WallItemProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticItem, updateOptimisticItem] = useOptimistic(
    item,
    (currentItem, update: Partial<WallItemType>) => ({
      ...currentItem,
      ...update
    })
  );

  const handleLike = () => {
    startTransition(async () => {
      // Optimistic update
      updateOptimisticItem({ 
        liked: !optimisticItem.liked,
        likeCount: optimisticItem.liked 
          ? optimisticItem.likeCount - 1 
          : optimisticItem.likeCount + 1
      });

      // Server action
      await likeItem(item.id, !optimisticItem.liked);
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      // Optimistic removal
      updateOptimisticItem({ removed: true });
      
      // Server action
      await removeItem(item.id);
    });
  };

  if (optimisticItem.removed) {
    return null; // Optimistically hidden
  }

  return (
    <article className={`wall-item ${isPending ? 'opacity-70' : ''}`}>
      <div className="item-content">
        {optimisticItem.type === 'url' && (
          <LinkPreview url={optimisticItem.url} />
        )}
        {optimisticItem.type === 'text' && (
          <TextContent content={optimisticItem.content} />
        )}
        {optimisticItem.type === 'image' && (
          <ImageContent src={optimisticItem.src} alt={optimisticItem.alt} />
        )}
      </div>
      
      <footer className="item-actions">
        <button
          onClick={handleLike}
          disabled={isPending}
          className={`like-btn ${optimisticItem.liked ? 'liked' : ''}`}
        >
          ❤️ {optimisticItem.likeCount}
        </button>
        
        <button
          onClick={handleRemove}
          disabled={isPending}
          className="remove-btn"
        >
          🗑️ Remove
        </button>
      </footer>
    </article>
  );
}
```

## Production Considerations

### Performance Optimization

```typescript
// lib/performance.ts - Performance monitoring and optimization
export class PerformanceMonitor {
  static measureShareProcessing(shareData: any) {
    const startTime = performance.now();
    
    return {
      end: (result: any) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Send metrics to analytics
        gtag('event', 'share_processing_time', {
          duration: Math.round(duration),
          content_type: shareData.type,
          success: !!result.success
        });
        
        // Performance budgets
        if (duration > 2000) {
          console.warn('Share processing took too long:', duration + 'ms');
        }
      }
    };
  }
  
  static trackPWAMetrics() {
    // Core Web Vitals for PWA
    if ('web-vitals' in window) {
      import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
        getCLS(console.log);
        getFID(console.log);
        getFCP(console.log);
        getLCP(console.log);
        getTTFB(console.log);
      });
    }
  }
}

// Preload critical resources
export function preloadCriticalResources() {
  // Preload share processing script
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = '/api/share';
  document.head.appendChild(link);
  
  // Preload AI processing endpoint
  const aiLink = document.createElement('link');
  aiLink.rel = 'prefetch';
  aiLink.href = '/api/ai/process';
  document.head.appendChild(aiLink);
}
```

### Build Optimization

```typescript
// next.config.js - Production optimizations
const nextConfig = {
  // Bundle analysis
  bundleAnalyzer: {
    enabled: process.env.ANALYZE === 'true'
  },
  
  // Compression
  compress: true,
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2592000, // 30 days
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.digitalwall.app wss://api.digitalwall.app",
              "frame-ancestors 'none'",
              "base-uri 'self'"
            ].join('; ')
          }
        ]
      }
    ];
  }
};
```

## Integration Examples

### Complete PWA Architecture

```mermaid
graph TD
    A[User Browser] --> B[Next.js 14 App]
    B --> C[App Router]
    C --> D[Server Components]
    C --> E[Client Components]
    
    D --> F[Server Actions]
    F --> G[Share Processing]
    G --> H[[[FastAPI Async Architecture]]]
    
    E --> I[PWA Features]
    I --> J[Share Target API]
    I --> K[Service Worker]
    
    K --> L[Cache Strategy]
    L --> M[[[Cloudflare R2 Storage]]]
    
    G --> N[[[Claude Sonnet 4 Integration]]]
    N --> O[AI Processing]
    
    subgraph "Edge Runtime"
        P[Edge API Routes]
        Q[Global Distribution]
    end
    
    H --> P
    M --> Q
```

### Integration with [[Digital Wall]] Components

The Next.js 14 PWA patterns integrate seamlessly with:

- **[[PWA Share Target API]]**: Frontend implementation of share handling
- **[[FastAPI Async Architecture]]**: Backend API communication
- **[[Cloudflare R2 Storage]]**: Asset serving and caching
- **[[Claude Sonnet 4 Integration]]**: AI processing integration
- **[[Content Processing Pipeline]]**: Data flow orchestration

## References & Further Reading

### Official Documentation
- [Next.js 14 Documentation](https://nextjs.org/docs)
- [App Router Guide](https://nextjs.org/docs/app)
- [Server Actions](https://nextjs.org/docs/app/api-reference/functions/server-actions)
- [Next.js PWA](https://github.com/shadowwalker/next-pwa)

### Performance Guides
- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Core Web Vitals](https://web.dev/vitals/)

### Related [[Vault]] Concepts
- [[Progressive Web Apps]] - PWA fundamentals
- [[React Server Components]] - Server-side rendering patterns
- [[Edge Computing]] - Edge runtime optimization
- [[App Router]] - Next.js routing system
- [[Performance Optimization]] - Web performance best practices

#digital-wall #research #nextjs #pwa #react #performance