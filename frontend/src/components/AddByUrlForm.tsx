'use client'

import { useState, useTransition } from 'react'

interface AddByUrlFormProps {
  onAddItem: (url: string) => Promise<void>
}

export function AddByUrlForm({ onAddItem }: AddByUrlFormProps) {
  const [url, setUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!url || !url.startsWith('http')) {
      setError('Please enter a valid URL.')
      return
    }

    startTransition(async () => {
      try {
        await onAddItem(url)
        setUrl('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add item.')
      }
    })
  }

  return (
    <div className="mb-8 p-4 border border-gray-700 rounded-lg bg-gray-800/50">
      <h3 className="text-lg font-semibold text-white mb-3">Add by URL</h3>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="flex-grow bg-gray-700 text-white px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Adding...' : 'Add'}
        </button>
      </form>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  )
}
