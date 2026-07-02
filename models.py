from django.db import models
from django.contrib.auth.models import User
from django.contrib.sites.models import Site
from django.utils.text import slugify

class Room(models.Model):
    name = models.CharField(max_length=255, verbose_name="Room name")
    slug = models.SlugField(blank=True)
    site = models.ForeignKey(
        Site, 
        on_delete=models.CASCADE, 
        related_name='chat_rooms'
    )
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='owned_rooms',
        verbose_name="Owner"
    )
    participants = models.ManyToManyField(
        User,
        related_name='joined_rooms',
        blank=True,
        verbose_name="Participants"
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
