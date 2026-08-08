import json
from django.core.cache import cache
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model
from channels.testing import WebsocketCommunicator

from chat657.consumers import ChatConsumer

User = get_user_model()


class ChatConsumerTests(TransactionTestCase):
    # TransactionTestCase is used for asynchronous tests to avoid database locks

    def setUp(self):

        # Clear the cache before each test so that old channel names disappear
        cache.clear()

        # Create test user
        self.user_alice = User.objects.create_user(
            username='alice', password='password'
        )
        self.user_bob = User.objects.create_user(username='bob', password='password')

        self.room_name = 'test-room'

    async def get_communicator(self, user):
        """Helper function to connect a user to the consumer."""
        communicator = WebsocketCommunicator(
            ChatConsumer.as_asgi(), f"/ws/chat/{self.room_name}/"
        )

        # Mock the scope so that the consumer thinks the user is logged in
        communicator.scope["user"] = user
        communicator.scope["url_route"] = {"kwargs": {"room_name": self.room_name}}

        connected, subprotocol = await communicator.connect()
        self.assertTrue(connected)

        # Consume the first message (user_list_update) sent on connect
        await communicator.receive_from()

        return communicator

    async def test_chat_message(self):
        """Tests that a public message reaches everyone in the room."""
        # Connect Alice and Bob
        communicator_alice = await self.get_communicator(self.user_alice)
        communicator_bob = await self.get_communicator(self.user_bob)

        # Bob also needs to clear his updated user list that is sent when he logs in
        await communicator_alice.receive_from()

        # Alice sends a message
        await communicator_alice.send_to(
            text_data=json.dumps({'type': 'chat_message', 'message': 'Hello everyone!'})
        )

        # Verify that Bob receives the message
        response_bob = await communicator_bob.receive_from()
        response_data = json.loads(response_bob)

        self.assertEqual(response_data['type'], 'chat_message')
        self.assertEqual(response_data['sender'], 'alice')
        self.assertEqual(response_data['message'], 'Hello everyone!')

        # Disconnect
        await communicator_alice.disconnect()
        await communicator_bob.disconnect()

    async def test_private_message(self):
        """Tests that a private message only reaches the intended recipient."""
        # Connect Alice and Bob
        communicator_alice = await self.get_communicator(self.user_alice)
        communicator_bob = await self.get_communicator(self.user_bob)

        await communicator_alice.receive_from()  # Clear broadcast

        # Alice sends a private message addressed to Bob
        await communicator_alice.send_to(
            text_data=json.dumps(
                {
                    'type': 'private_message',
                    'target_user': 'bob',
                    'message': 'Secret message for you, Bob.',
                }
            )
        )

        # 1. Verify that Bob receives the private message
        response_bob = await communicator_bob.receive_from()
        response_bob_data = json.loads(response_bob)

        self.assertEqual(response_bob_data['type'], 'private_message')
        self.assertEqual(response_bob_data['sender'], 'alice')
        self.assertEqual(response_bob_data['message'], 'Secret message for you, Bob.')

        # 2. Verify that Alice gets back a receipt of her own message
        response_alice = await communicator_alice.receive_from()
        response_alice_data = json.loads(response_alice)

        self.assertEqual(response_alice_data['type'], 'private_message')
        self.assertEqual(response_alice_data['sender'], 'alice')
        self.assertEqual(response_alice_data['message'], 'Secret message for you, Bob.')

        # Disconnect
        await communicator_alice.disconnect()
        await communicator_bob.disconnect()
