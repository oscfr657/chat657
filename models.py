from django.db import models
from django.conf import settings
from django.contrib.sites.models import Site
from django.utils.text import slugify


class Room(models.Model):
    name = models.CharField(max_length=255, verbose_name="Room name")
    slug = models.SlugField(blank=True)
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name='chat_rooms')
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='owned_rooms',
        verbose_name="Owner",
    )
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='joined_rooms',
        verbose_name="Participants",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = (('name', 'site'), ('slug', 'site'))
        verbose_name = "Room"
        verbose_name_plural = "Rooms"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.site.domain})"


class RoomBackgroundImage(models.Model):
    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name='background_images',
        verbose_name="Room"
    )
    title = models.CharField(max_length=100, verbose_name="Image Title", blank=True)
    image = models.ImageField(upload_to='room_backgrounds/', verbose_name="Background Image")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Room Background Image"
        verbose_name_plural = "Room Background Images"

    def __str__(self):
        return self.title or f"Background for {self.room.name}"