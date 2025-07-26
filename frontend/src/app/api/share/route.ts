import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get form data from the share target
    const formData = await request.formData()
    
    // Forward to FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://digital-wall-mvp-backend-1:8000'
    const backendResponse = await fetch(`${backendUrl}/api/share`, {
      method: 'POST',
      body: formData,
    })
    
    // Get the correct origin for redirects
    const origin = request.headers.get('x-forwarded-proto') && request.headers.get('x-forwarded-host')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('x-forwarded-host')}`
      : request.nextUrl.origin
    
    // Always redirect to success page regardless of backend response status
    const redirectUrl = new URL('/', origin)
    if (backendResponse.ok || backendResponse.status === 303) {
      redirectUrl.searchParams.set('share', 'success')
    } else {
      redirectUrl.searchParams.set('share', 'error')
    }
    
    return NextResponse.redirect(redirectUrl)
    
  } catch (error) {
    console.error('Share API error:', error)
    
    // Get the correct origin for error redirects
    const origin = request.headers.get('x-forwarded-proto') && request.headers.get('x-forwarded-host')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('x-forwarded-host')}`
      : request.nextUrl.origin
      
    const redirectUrl = new URL('/', origin)
    redirectUrl.searchParams.set('share', 'error')
    return NextResponse.redirect(redirectUrl)
  }
}