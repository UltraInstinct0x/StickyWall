import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const wallId = params.id;
  console.log(`Fetching items for wall ID: ${wallId}`);

  try {
    const response = await fetch(`${BACKEND_URL}/api/walls/${wallId}`);
    console.log(`Backend response for wall ${wallId}:`, response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend error for wall ${wallId}: ${response.status} - ${errorText}`);
      throw new Error(`Backend responded with ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Data received for wall ${wallId}, item count:`, data.items?.length ?? 0);
    return NextResponse.json(data);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`Wall proxy error for wall ${wallId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch wall', details: message },
      { status: 500 }
    );
  }
}