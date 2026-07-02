import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .utils import (
    mark_user_as_active,
    get_active_users,
    set_user_channel,
    get_user_channel,
    remove_user_channel
    )


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"chat_{self.room_name}"
        self.user = self.scope["user"]

        # Cache the user's channel
        await database_sync_to_async(set_user_channel)(self.user.username, self.channel_name)

        # Mark user as active (synchronous function done asynchronously)
        await database_sync_to_async(mark_user_as_active)(self.room_name, self.user)

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        # Send updated user list
        await self.broadcast_user_list()

    async def disconnect(self, close_code):
        await database_sync_to_async(remove_user_channel)(self.user.username)

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        await self.broadcast_user_list()

    async def receive(self, text_data):
        data = json.loads(text_data)
        action_type = data.get('type')

        # Group chat
        if action_type == 'chat_message':
            # Also update the cache when the user sends messages during the call
            await database_sync_to_async(mark_user_as_active)(self.room_name, self.user)
            
            if data['message']:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat_message',
                        'message': data['message'],
                        'sender': self.user.username
                    }
                )

        # Send private direct message
        elif action_type == 'private_message':
            target_user = data.get('target_user')
            target_channel = await database_sync_to_async(get_user_channel)(target_user)

            if target_channel and data['message']:
                await self.channel_layer.send(
                    target_channel,
                    {
                        'type': 'private_message',
                        'message': data['message'],
                        'sender': self.user.username
                    }
                )
                # Send a copy back to the sender so it appears in their own log
                await self.send(text_data=json.dumps({
                    'type': 'private_message',
                    'message': data['message'],
                    'sender': self.user.username
                }))

    async def broadcast_user_list(self):
        active_users_list = await database_sync_to_async(get_active_users)(self.room_name)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_list_update',
                'users': active_users_list
            }
        )

    async def user_list_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_list_update',
            'users': event['users']
        }))

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'sender': event['sender'],
            'message': event['message']
        }))

    async def private_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'private_message',
            'sender': event['sender'],
            'message': event['message']
        }))
