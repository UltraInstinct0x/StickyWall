"""
WebSocket API endpoints for real-time features
"""
import uuid
import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from app.services.websocket_manager import connection_manager
from app.services.auth_service import get_current_user_websocket

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    """
    Main WebSocket endpoint for real-time features
    
    Query parameters:
    - token: JWT token for authentication (optional for anonymous users)
    - user_id: User ID (required for anonymous users)
    """
    connection_id = str(uuid.uuid4())
    
    try:
        # Handle authentication
        if token:
            # Authenticated user
            try:
                current_user = await get_current_user_websocket(token)
                user_id = current_user.id
            except Exception as e:
                logger.error(f"WebSocket authentication failed: {e}")
                await websocket.close(code=4001, reason="Authentication failed")
                return
        elif user_id:
            # Anonymous user with provided user_id
            pass
        else:
            # Generate anonymous user ID
            user_id = f"anonymous_{uuid.uuid4().hex[:8]}"
        
        # Accept connection
        await connection_manager.connect(websocket, user_id, connection_id)
        
        # Keep connection alive and handle messages
        while True:
            try:
                # Receive message from client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Handle the message
                await connection_manager.handle_message(websocket, user_id, connection_id, message)
                
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({
                    'type': 'error',
                    'message': 'Invalid JSON format'
                }))
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error in WebSocket message handling: {e}")
                await websocket.send_text(json.dumps({
                    'type': 'error',
                    'message': 'Internal server error'
                }))
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        # Clean up connection
        await connection_manager.disconnect(user_id, connection_id)

@router.get("/ws/stats")
async def websocket_stats():
    """Get WebSocket connection statistics"""
    return {
        "status": "success",
        "data": connection_manager.get_stats()
    }

@router.post("/ws/broadcast")
async def broadcast_message(
    room_id: str,
    message: dict,
    current_user = Depends(get_current_user_websocket)
):
    """
    Broadcast a message to all users in a specific room
    Requires authentication
    """
    try:
        sent_count = await connection_manager.broadcast_to_room(room_id, {
            'type': 'broadcast',
            'sender': current_user.id,
            'data': message
        })
        
        return {
            "status": "success",
            "message": f"Message broadcasted to {sent_count} users in room {room_id}"
        }
    except Exception as e:
        logger.error(f"Error broadcasting message: {e}")
        return {
            "status": "error",
            "message": "Failed to broadcast message"
        }

@router.post("/ws/notify")
async def notify_user(
    target_user_id: str,
    message: dict,
    current_user = Depends(get_current_user_websocket)
):
    """
    Send a direct message to a specific user
    Requires authentication
    """
    try:
        success = await connection_manager.send_personal_message({
            'type': 'notification',
            'sender': current_user.id,
            'data': message
        }, target_user_id)
        
        if success:
            return {
                "status": "success",
                "message": f"Message sent to user {target_user_id}"
            }
        else:
            return {
                "status": "error",
                "message": f"User {target_user_id} is not connected"
            }
    except Exception as e:
        logger.error(f"Error sending notification: {e}")
        return {
            "status": "error",
            "message": "Failed to send notification"
        }