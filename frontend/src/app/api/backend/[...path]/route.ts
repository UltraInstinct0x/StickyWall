import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyToBackend(request, params.path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyToBackend(request, params.path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyToBackend(request, params.path, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyToBackend(request, params.path, 'DELETE');
}

async function proxyToBackend(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  try {
    const backendPath = pathSegments.join('/');
    const backendUrl = `${BACKEND_URL}/api/${backendPath}`;
    
    // Copy search parameters
    const url = new URL(backendUrl);
    request.nextUrl.searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    // Prepare headers (exclude some Next.js specific headers)
    const headers: HeadersInit = {};
    request.headers.forEach((value, key) => {
      if (!key.startsWith('x-') && key !== 'host' && key !== 'connection') {
        headers[key] = value;
      }
    });

    // Prepare request body
    let body: BodyInit | undefined;
    if (method !== 'GET' && method !== 'DELETE') {
      if (request.headers.get('content-type')?.includes('application/json')) {
        body = await request.text();
      } else {
        // For form data, pass through as-is
        body = await request.arrayBuffer();
      }
    }

    // Make request to backend
    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
    });

    // Handle redirects specially
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        // Convert backend redirects to frontend URLs
        const redirectUrl = location.replace(BACKEND_URL, request.nextUrl.origin);
        return NextResponse.redirect(redirectUrl, response.status);
      }
    }

    // Copy response headers
    const responseHeaders: HeadersInit = {};
    response.headers.forEach((value, key) => {
      if (key !== 'content-encoding' && key !== 'transfer-encoding') {
        responseHeaders[key] = value;
      }
    });

    // Return response
    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('Backend proxy error:', error);
    return NextResponse.json(
      { error: 'Backend service unavailable' },
      { status: 503 }
    );
  }
}