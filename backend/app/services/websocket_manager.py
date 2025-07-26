"""
WebSocket Manager for Real-time Features
Handles live updates, collaborative features, and real-time notifications
"""
import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
from app.services.redis_service import redis_service

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections for real-time features
    """
    
    def __init__(self):
        # Active connections: {user_id: {connection_id: websocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # Room subscriptions: {room_id: {user_id}}
        self.room_subscriptions: Dict[str, Set[str]] = {}
        # User sessions: {connection_id: user_info}
        self.user_sessions: Dict[str, Dict[str, Any]] = {}
        
    async def connect(self, websocket: WebSocket, user_id: str, connection_id: str):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        
        # Store connection
        if user_id not in self.active_connections:
            self.active_connections[user_id] = {}
        self.active_connections[user_id][connection_id] = websocket
        
        # Store session info
        self.user_sessions[connection_id] = {
            'user_id': user_id,
            'connected_at': datetime.utcnow().isoformat(),
            'last_activity': datetime.utcnow().isoformat()
        }
        
        logger.info(f"User {user_id} connected with connection {connection_id}")
        
        # Send welcome message
        await self.send_personal_message({
            'type': 'connection_established',
            'connection_id': connection_id,
            'timestamp': datetime.utcnow().isoformat()
        }, user_id, connection_id)
        
        # Publish connection event
        await self._publish_user_event(user_id, 'user_connected')
        
    async def disconnect(self, user_id: str, connection_id: str):
        """Handle WebSocket disconnection"""
        # Remove from active connections
        if user_id in self.active_connections:
            if connection_id in self.active_connections[user_id]:
                del self.active_connections[user_id][connection_id]
            
            # Clean up empty user connections
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        
        # Remove from room subscriptions
        for room_id, users in self.room_subscriptions.items():
            users.discard(user_id)
        
        # Clean up empty rooms
        self.room_subscriptions = {
            room_id: users for room_id, users in self.room_subscriptions.items()
            if users
        }
        
        # Remove session info
        self.user_sessions.pop(connection_id, None)
        
        logger.info(f"User {user_id} disconnected (connection {connection_id})")
        
        # Publish disconnection event
        await self._publish_user_event(user_id, 'user_disconnected')
    
    async def send_personal_message(self, message: Dict[str, Any], user_id: str, connection_id: Optional[str] = None):
        """Send message to specific user"""
        if user_id not in self.active_connections:
            return False
            
        connections = self.active_connections[user_id]
        
        # Send to specific connection or all user connections
        target_connections = {connection_id: connections[connection_id]} if connection_id and connection_id in connections else connections
        
        sent_count = 0
        for conn_id, websocket in list(target_connections.items()):
            try:
                await websocket.send_text(json.dumps(message))
                sent_count += 1
                
                # Update last activity
                if conn_id in self.user_sessions:
                    self.user_sessions[conn_id]['last_activity'] = datetime.utcnow().isoformat()
                    
            except WebSocketDisconnect:
                await self.disconnect(user_id, conn_id)
            except Exception as e:
                logger.error(f"Error sending message to {user_id}:{conn_id}: {e}")
                await self.disconnect(user_id, conn_id)
        
        return sent_count > 0
    
    async def broadcast_to_room(self, room_id: str, message: Dict[str, Any], exclude_user_id: Optional[str] = None):
        """Broadcast message to all users in a room"""
        if room_id not in self.room_subscriptions:
            return 0
            
        sent_count = 0
        for user_id in list(self.room_subscriptions[room_id]):
            if exclude_user_id and user_id == exclude_user_id:
                continue
                
            if await self.send_personal_message(message, user_id):
                sent_count += 1
        
        return sent_count
    
    async def subscribe_to_room(self, room_id: str, user_id: str):
        """Subscribe user to a room for updates"""
        if room_id not in self.room_subscriptions:
            self.room_subscriptions[room_id] = set()
        
        self.room_subscriptions[room_id].add(user_id)
        
        # Send confirmation
        await self.send_personal_message({
            'type': 'room_subscribed',
            'room_id': room_id,
            'timestamp': datetime.utcnow().isoformat()
        }, user_id)
        
        logger.info(f"User {user_id} subscribed to room {room_id}")
        
        # Notify other room members
        await self.broadcast_to_room(room_id, {
            'type': 'user_joined_room',
            'user_id': user_id,
            'room_id': room_id,
            'timestamp': datetime.utcnow().isoformat()
        }, exclude_user_id=user_id)
    
    async def unsubscribe_from_room(self, room_id: str, user_id: str):
        """Unsubscribe user from a room"""
        if room_id in self.room_subscriptions:
            self.room_subscriptions[room_id].discard(user_id)
            
            # Clean up empty room
            if not self.room_subscriptions[room_id]:
                del self.room_subscriptions[room_id]
        
        # Send confirmation
        await self.send_personal_message({
            'type': 'room_unsubscribed',
            'room_id': room_id,
            'timestamp': datetime.utcnow().isoformat()
        }, user_id)
        
        logger.info(f"User {user_id} unsubscribed from room {room_id}")
        
        # Notify other room members
        if room_id in self.room_subscriptions:
            await self.broadcast_to_room(room_id, {
                'type': 'user_left_room',
                'user_id': user_id,
                'room_id': room_id,
                'timestamp': datetime.utcnow().isoformat()
            })
    
    async def handle_message(self, websocket: WebSocket, user_id: str, connection_id: str, message: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        try:
            message_type = message.get('type')
            
            if message_type == 'ping':
                await websocket.send_text(json.dumps({
                    'type': 'pong',
                    'timestamp': datetime.utcnow().isoformat()
                }))
                
            elif message_type == 'subscribe_room':
                room_id = message.get('room_id')
                if room_id:
                    await self.subscribe_to_room(room_id, user_id)
                    
            elif message_type == 'unsubscribe_room':
                room_id = message.get('room_id')
                if room_id:
                    await self.unsubscribe_from_room(room_id, user_id)
                    
            elif message_type == 'wall_update':
                # Handle real-time wall updates
                await self._handle_wall_update(user_id, message)
                
            elif message_type == 'share_progress':
                # Handle share processing progress updates
                await self._handle_share_progress(user_id, message)
                
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except Exception as e:
            logger.error(f"Error handling message from {user_id}: {e}")
            await websocket.send_text(json.dumps({
                'type': 'error',
                'message': 'Failed to process message'
            }))
    
    async def _handle_wall_update(self, user_id: str, message: Dict[str, Any]):
        """Handle wall update messages"""
        wall_id = message.get('wall_id')
        update_type = message.get('update_type')  # 'item_added', 'item_removed', 'wall_updated'
        
        if not wall_id:
            return
            
        # Broadcast to all users subscribed to this wall
        await self.broadcast_to_room(f"wall_{wall_id}", {
            'type': 'wall_updated',
            'wall_id': wall_id,
            'update_type': update_type,
            'data': message.get('data', {}),
            'updated_by': user_id,
            'timestamp': datetime.utcnow().isoformat()
        }, exclude_user_id=user_id)
    
    async def _handle_share_progress(self, user_id: str, message: Dict[str, Any]):
        """Handle share processing progress updates"""
        share_id = message.get('share_id')
        progress = message.get('progress', 0)
        status = message.get('status', 'processing')
        
        # Send progress update to user
        await self.send_personal_message({
            'type': 'share_progress',
            'share_id': share_id,
            'progress': progress,
            'status': status,
            'timestamp': datetime.utcnow().isoformat()
        }, user_id)
    
    async def _publish_user_event(self, user_id: str, event_type: str):
        """Publish user events to Redis for cross-service communication"""
        try:
            event_data = {
                'user_id': user_id,
                'event_type': event_type,
                'timestamp': datetime.utcnow().isoformat(),
                'active_connections': len(self.active_connections.get(user_id, {}))
            }
            
            await redis_service.publish('user_events', json.dumps(event_data))
        except Exception as e:
            logger.error(f"Failed to publish user event: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get connection statistics"""
        total_connections = sum(len(connections) for connections in self.active_connections.values())
        
        return {
            'total_users': len(self.active_connections),
            'total_connections': total_connections,
            'active_rooms': len(self.room_subscriptions),
            'room_stats': {
                room_id: len(users) for room_id, users in self.room_subscriptions.items()
            }
        }

# Global connection manager instance
connection_manager = ConnectionManager()