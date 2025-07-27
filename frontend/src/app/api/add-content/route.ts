import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // Get form data from the request
    const formData = await request.formData()

    // Forward to FastAPI backend
    const backendUrl = process.env.BACKEND_URL || 'http://digital-wall-mvp-backend-1:8000'
    const backendResponse = await fetch(`${backendUrl}/api/share`, {
      method: 'POST',
      body: formData,
    })

    // Check if the backend request was successful
    if (backendResponse.ok || backendResponse.status === 303) {
      // Success - return JSON response
      return NextResponse.json({
        success: true,
        message: 'Content added successfully'
      }, { status: 200 })
    } else {
      // Backend error - get error details
      let errorMessage = 'Failed to add content'
      try {
        const errorText = await backendResponse.text()
        errorMessage = errorText || errorMessage
      } catch (e) {
        // Ignore error parsing error message
      }

      return NextResponse.json({
        success: false,
        error: errorMessage
      }, { status: backendResponse.status })
    }

  } catch (error) {
    console.error('Add content API error:', error)

    return NextResponse.json({
      success: false,
      error: 'Failed to add content'
    }, { status: 500 })
  }
}
