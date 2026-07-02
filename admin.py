from django.contrib import admin
from .models import Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('name', 'site', 'owner', 'created_at')
    list_display_links = ('name',)
    list_filter = ('site', 'created_at')
    search_fields = ('name', 'slug', 'owner__username')
    prepopulated_fields = {'slug': ('name',)}
    filter_horizontal = ('participants',)
