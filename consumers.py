import json
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q
from django.contrib.sites.models import Site

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from .models import Room
from .utils import (
    mark_user_as_active,
    get_active_users,
    set_user_channel,
    get_user_channel,
    remove_user_channel,
)


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]

        self.domain = self.get_domain_from_scope()
        if not self.domain:
            await self.close()
            return
        
        self.site_id = await self.get_site_id_and_verify_room(self.domain, self.room_name)
        if not self.site_id:
            await self.close()
            return

        self.room_group_name = f'chat_site_{self.site_id}_room_{self.room_name}'
        self.user = self.scope["user"]

        rooms = (
            Room.objects.filter(site=self.site_id)
            .filter(Q(owner=self.user) | Q(participants=self.user))
            .filter(slug=self.room_name)
            .first()
        )
        if not rooms:
            await self.close()
            return

        # Cache the user's channel
        await database_sync_to_async(set_user_channel)(
            self.site_id, self.user.username, self.channel_name
        )

        # Mark user as active (synchronous function done asynchronously)
        await database_sync_to_async(mark_user_as_active)(self.site_id, self.room_name, self.user)

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # Send updated user list
        await self.broadcast_user_list()

    def get_domain_from_scope(self):
        headers = dict(self.scope['headers'])
        if b'host' in headers:
            host_header = headers[b'host'].decode('utf-8')
            domain = host_header.split(':')[0]
            return domain
        return None

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await database_sync_to_async(remove_user_channel)(self.site_id, self.user.username)

            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            await self.broadcast_user_list()

    async def receive(self, text_data):
        data = json.loads(text_data)
        action_type = data.get('type')

        # Group chat
        if action_type == 'chat_message':
            # Also update the cache when the user sends messages during the call
            await database_sync_to_async(mark_user_as_active)(self.site_id, self.room_name, self.user)

            if data['message']:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'chat_message',
                        'message': data['message'],
                        'sender': self.user.username,
                    },
                )

        # Send private direct message
        elif action_type == 'private_message':
            target_user = data.get('target_user')
            target_channel = await database_sync_to_async(get_user_channel)(self.site_id, target_user)

            if target_channel and data['message']:
                await self.channel_layer.send(
                    target_channel,
                    {
                        'type': 'private_message',
                        'message': data['message'],
                        'sender': self.user.username,
                    },
                )
                # Send a copy back to the sender so it appears in their own log
                await self.send(
                    text_data=json.dumps(
                        {
                            'type': 'private_message',
                            'message': data['message'],
                            'sender': self.user.username,
                        }
                    )
                )

        # Directed WebRTC signaling
        elif action_type in ['webrtc_offer', 'webrtc_answer', 'webrtc_ice_candidate']:
            target_user = data.get('target_user')
            target_channel = await database_sync_to_async(get_user_channel)(self.site_id, target_user)

            if target_channel:
                await self.channel_layer.send(
                    target_channel,
                    {
                        'type': 'webrtc_signal',
                        'action': action_type,
                        'data': data.get('data'),
                        'sender': self.user.username,
                    },
                )

    async def broadcast_user_list(self):
        active_users_list = await database_sync_to_async(get_active_users)(
            self.site_id,
            self.room_name
        )
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'user_list_update', 'users': active_users_list},
        )

    async def user_list_update(self, event):
        await self.send(
            text_data=json.dumps({'type': 'user_list_update', 'users': event['users']})
        )

    async def chat_message(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    'type': 'chat_message',
                    'sender': event['sender'],
                    'message': event['message'],
                }
            )
        )

    async def private_message(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    'type': 'private_message',
                    'sender': event['sender'],
                    'message': event['message'],
                }
            )
        )

    async def webrtc_signal(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    'type': event['action'],
                    'sender': event['sender'],
                    'data': event['data'],
                }
            )
        )

    @database_sync_to_async
    def get_site_id_and_verify_room(self, domain, room_name):
        try:
            site = Site.objects.get(domain=domain)
            room = Room.objects.get(slug=room_name, site=site)
            return site.id
        except ObjectDoesNotExist:
            return None
