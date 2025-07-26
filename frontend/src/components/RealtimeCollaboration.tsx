'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface WebSocketMessage {
  type: string
  data?: any
  timestamp?: string
  sender?: string
  room_id?: string
}

interface ConnectionStats {
  total_users: number
  total_connections: number
  active_rooms: number
  room_stats: Record<string, number>
}

interface User {
  id: string
  avatar?: string
  name?: string
  status: 'online' | 'away' | 'offline'
  lastActivity?: string
}

interface RealtimeCollaborationProps {
  userId: string
  wallId?: string
  authToken?: string
  onContentUpdate?: (data: any) => void
  onUserJoined?: (user: User) => void
  onUserLeft?: (userId: string) => void
}

export function RealtimeCollaboration({
  userId,
  wallId,
  authToken,
  onContentUpdate,
  onUserJoined,
  onUserLeft
}: RealtimeCollaborationProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStats, setConnectionStats] = useState<ConnectionStats | null>(null)
  const [activeUsers, setActiveUsers] = useState<User[]>([])
  const [notifications, setNotifications] = useState<WebSocketMessage[]>([])
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  const ws = useRef<WebSocket | null>(null)
  const router = useRouter()
  const maxReconnectAttempts = 5
  const reconnectDelay = 1000

  const connect = useCallback(() => {
    try {
      const wsUrl = new URL('/ws', window.location.origin.replace('http', 'ws'))
      if (authToken) {
        wsUrl.searchParams.set('token', authToken)
      } else {
        wsUrl.searchParams.set('user_id', userId)
      }

      console.log('🔗 Connecting to WebSocket:', wsUrl.toString())
      
      ws.current = new WebSocket(wsUrl.toString())

      ws.current.onopen = () => {
        console.log('✅ WebSocket connected')
        setIsConnected(true)
        setReconnectAttempts(0)
        
        // Subscribe to wall updates if wallId is provided
        if (wallId) {
          sendMessage({
            type: 'subscribe_room',
            room_id: `wall_${wallId}`
          })
        }
      }

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error)
        }
      }

      ws.current.onclose = (event) => {
        console.log('❌ WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        
        // Attempt reconnection if not a normal close
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          setTimeout(() => {
            setReconnectAttempts(prev => prev + 1)
            connect()
          }, reconnectDelay * Math.pow(2, reconnectAttempts))
        }
      }

      ws.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
      }

    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error)
    }
  }, [userId, authToken, wallId, reconnectAttempts])

  const disconnect = useCallback(() => {
    if (ws.current) {
      ws.current.close(1000, 'Manual disconnect')
      ws.current = null
    }
  }, [])

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    } else {
      console.warn('⚠️ WebSocket not connected, message not sent:', message)
    }
  }, [])

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log('📨 Received message:', message)

    switch (message.type) {
      case 'connection_established':
        console.log('🎉 Connection established')
        break

      case 'wall_updated':
        console.log('🔄 Wall updated:', message.data)
        if (onContentUpdate) {
          onContentUpdate(message.data)
        }
        addNotification({
          type: 'info',
          data: { message: `Wall updated by ${message.sender}` },
          timestamp: message.timestamp
        })
        break

      case 'user_joined_room':
        console.log('👋 User joined:', message.data)
        if (onUserJoined) {
          onUserJoined({
            id: message.data.user_id,
            name: message.data.name || message.data.user_id,
            status: 'online'
          })
        }
        addNotification({
          type: 'user_activity',
          data: { message: `${message.data.user_id} joined the wall` },
          timestamp: message.timestamp
        })
        break

      case 'user_left_room':
        console.log('👋 User left:', message.data)
        if (onUserLeft) {
          onUserLeft(message.data.user_id)
        }
        addNotification({
          type: 'user_activity',
          data: { message: `${message.data.user_id} left the wall` },
          timestamp: message.timestamp
        })
        break

      case 'share_progress':
        console.log('📊 Share progress:', message.data)
        addNotification({
          type: 'progress',
          data: message.data,
          timestamp: message.timestamp
        })
        break

      case 'notification':
        addNotification({
          type: 'notification',
          data: message.data,
          timestamp: message.timestamp,
          sender: message.sender
        })
        break

      case 'broadcast':
        addNotification({
          type: 'broadcast',
          data: message.data,
          timestamp: message.timestamp,
          sender: message.sender
        })
        break

      case 'error':
        console.error('❌ Server error:', message.data)
        addNotification({
          type: 'error',
          data: message.data,
          timestamp: message.timestamp
        })
        break

      case 'pong':
        // Handle ping/pong for connection health
        break

      default:
        console.log('🤷 Unknown message type:', message.type)
    }
  }, [onContentUpdate, onUserJoined, onUserLeft])

  const addNotification = useCallback((notification: WebSocketMessage) => {
    setNotifications(prev => [...prev.slice(-9), notification]) // Keep last 10 notifications
  }, [])

  const sendPing = useCallback(() => {
    sendMessage({ type: 'ping' })
  }, [sendMessage])

  const notifyWallUpdate = useCallback((wallId: string, updateType: string, data: any) => {
    sendMessage({
      type: 'wall_update',
      data: {
        wall_id: wallId,
        update_type: updateType,
        data
      }
    })
  }, [sendMessage])

  const subscribeToWall = useCallback((wallId: string) => {
    sendMessage({
      type: 'subscribe_room',
      room_id: `wall_${wallId}`
    })
  }, [sendMessage])

  const unsubscribeFromWall = useCallback((wallId: string) => {
    sendMessage({
      type: 'unsubscribe_room',
      room_id: `wall_${wallId}`
    })
  }, [sendMessage])

  // Connection management effects
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  // Ping interval for connection health
  useEffect(() => {
    if (isConnected) {
      const pingInterval = setInterval(sendPing, 30000) // Ping every 30 seconds
      return () => clearInterval(pingInterval)
    }
  }, [isConnected, sendPing])

  // Fetch connection statistics periodically
  useEffect(() => {
    if (isConnected) {
      const fetchStats = async () => {
        try {
          const response = await fetch('/api/ws/stats')
          const data = await response.json()
          if (data.status === 'success') {
            setConnectionStats(data.data)
          }
        } catch (error) {
          console.error('Failed to fetch WebSocket stats:', error)
        }
      }

      fetchStats()
      const statsInterval = setInterval(fetchStats, 60000) // Every minute
      return () => clearInterval(statsInterval)
    }
  }, [isConnected])

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Connection Status Indicator */}
      <div className="mb-2 flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${
          isConnected 
            ? 'bg-green-500 animate-pulse' 
            : reconnectAttempts > 0 
              ? 'bg-yellow-500 animate-spin' 
              : 'bg-red-500'
        }`} />
        <span className="text-sm text-gray-300">
          {isConnected 
            ? 'Connected' 
            : reconnectAttempts > 0 
              ? `Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})` 
              : 'Disconnected'
          }
        </span>
        
        {connectionStats && (
          <span className="text-xs text-gray-400">
            {connectionStats.total_users} users online
          </span>
        )}
      </div>

      {/* Active Users */}
      {activeUsers.length > 0 && (
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-3 mb-2 shadow-lg">
          <h4 className="text-sm font-semibold text-white mb-2">Active Users</h4>
          <div className="flex flex-wrap gap-1">
            {activeUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-1 text-xs">
                <div className={`w-2 h-2 rounded-full ${
                  user.status === 'online' ? 'bg-green-400' : 
                  user.status === 'away' ? 'bg-yellow-400' : 'bg-gray-400'
                }`} />
                <span className="text-gray-300">{user.name || user.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Notifications */}
      {notifications.length > 0 && (
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-3 max-w-sm shadow-lg">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-white">Recent Activity</h4>
            <button
              onClick={() => setNotifications([])}
              className="text-xs text-gray-400 hover:text-white"
            >
              Clear
            </button>
          </div>
          
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {notifications.slice(-5).map((notification, index) => (
              <div key={index} className={`text-xs p-2 rounded ${
                notification.type === 'error' 
                  ? 'bg-red-500/20 text-red-200'
                  : notification.type === 'progress'
                    ? 'bg-blue-500/20 text-blue-200'
                    : notification.type === 'user_activity'
                      ? 'bg-purple-500/20 text-purple-200'
                      : 'bg-gray-700/50 text-gray-300'
              }`}>
                {notification.data?.message || JSON.stringify(notification.data)}
                {notification.timestamp && (
                  <span className="block text-xs opacity-70 mt-1">
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Development Controls (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 flex gap-1">
          <button
            onClick={sendPing}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
            disabled={!isConnected}
          >
            Ping
          </button>
          <button
            onClick={() => setNotifications([])}
            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

export default RealtimeCollaboration