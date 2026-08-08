from django.test import TestCase
from django.db import IntegrityError
from django.contrib.auth import get_user_model
from django.contrib.sites.models import Site

from chat657.models import Room

User = get_user_model()


class RoomModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='owner', password='password')

        self.site_a = Site.objects.create(domain='site-a.com', name='Site A')
        self.site_b = Site.objects.create(domain='site-b.com', name='Site B')

    def test_room_unique_together_constraint(self):
        """Testing that two rooms cannot have the same name on the same site."""
        Room.objects.create(name="General", site=self.site_a, owner=self.user)
        Room.objects.create(name="General", site=self.site_b, owner=self.user)
        with self.assertRaises(IntegrityError):
            Room.objects.create(name="General", site=self.site_a, owner=self.user)
