import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000';

export async function GET(request: NextRequest) {
  try {
    console.log('Fetching from backend:', `${BACKEND_URL}/api/walls`);
    
    const response = await fetch(`${BACKEND_URL}/api/walls`);
    console.log('Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Backend error: ${response.status} - ${errorText}`);
      return NextResponse.json({ error: `Backend error: ${response.status}` }, { status: 500 });
    }
    
    const data = await response.json();
    console.log('Backend data received:', Array.isArray(data) ? data.length : 'not array', 'walls');
    
    return NextResponse.json(data);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Walls proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch walls', details: message },
      { status: 500 }
    );
  }
}