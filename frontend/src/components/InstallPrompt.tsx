'use client'

import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      
      const installPromptEvent = e as BeforeInstallPromptEvent
      setDeferredPrompt(installPromptEvent)
      
      // Show our custom install prompt after a delay
      setTimeout(() => {
        setShowPrompt(true)
      }, 3000)
    }

    const handleAppInstalled = () => {
      console.log('PWA was installed')
      setDeferredPrompt(null)
      setShowPrompt(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    // Show the install prompt
    await deferredPrompt.prompt()

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice

    console.log(`User response to install prompt: ${outcome}`)

    // Clear the deferredPrompt for next time
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Don't show again for this session
    localStorage.setItem('installPromptDismissed', 'true')
  }

  // Don't show if user has already dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('installPromptDismissed')
    if (dismissed) {
      setShowPrompt(false)
    }
  }, [])

  if (!showPrompt || !deferredPrompt) {
    return null
  }

  return (
    <div className="install-prompt fixed bottom-4 left-4 right-4 z-50 bg-gradient-to-r from-purple-800 to-pink-800 rounded-lg shadow-xl p-4 text-white">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-2xl">📱</div>
        
        <div className="flex-grow">
          <h3 className="font-semibold mb-1">Install Digital Wall</h3>
          <p className="text-sm text-purple-100 mb-3">
            Install our app for the best experience - share content from anywhere!
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={handleInstallClick}
              className="bg-white text-purple-800 px-4 py-2 rounded-md font-medium text-sm hover:bg-purple-50 transition-colors"
            >
              Install
            </button>
            
            <button
              onClick={handleDismiss}
              className="bg-purple-700 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-600 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-purple-200 hover:text-white transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}