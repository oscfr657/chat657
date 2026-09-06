import datetime

from django.core.cache import cache


def mark_user_as_active(site_id, room_name, user):
    """Saves or refreshes the user's activity in the cache for 5 minutes."""
    cache_key = f"active_users_{site_id}_{room_name}"

    # Get existing list from cache, or an empty dict
    active_users = cache.get(cache_key, {})

    # Set current time (user's last activity)
    active_users[user.username] = datetime.datetime.now()

    # Save back to cache (valid for 300 seconds / 5 minutes)
    cache.set(cache_key, active_users, timeout=300)


def get_active_users(site_id, room_name):
    """Returns a list of usernames that have been active in the last 5 minutes."""
    cache_key = f"active_users_{site_id}_{room_name}"
    active_users = cache.get(cache_key, {})

    now = datetime.datetime.now()
    valid_users = []

    # Filter out users who have been inactive for longer than 5 minutes
    for username, last_seen in active_users.items():
        if (now - last_seen).total_seconds() < 300:
            valid_users.append(username)
    return valid_users


def set_user_channel(site_id, username, channel_name):
    """Adds a user's channel name to a set in the cache."""
    cache_key = f"user_channel_{site_id}_{username}"

    # Get existing channels as a set (or create a new one)
    channels = cache.get(cache_key, set())
    if isinstance(channels, list):
        channels = set(channels)

    channels.add(channel_name)

    # Save to cache for 1 hour
    cache.set(cache_key, channels, timeout=3600)


def get_user_channels(site_id, username):
    """Retrieves a list of a user's active channel names from the cache."""
    cache_key = f"user_channel_{site_id}_{username}"
    channels = cache.get(cache_key, set())
    return list(channels) if channels else []


def remove_user_channel(site_id, username, channel_name):
    """Removes a specific channel name from the user's active channels in the cache."""
    cache_key = f"user_channel_{site_id}_{username}"
    channels = cache.get(cache_key, set())

    if isinstance(channels, list):
        channels = set(channels)

    # Delete this specific channel
    if channel_name in channels:
        channels.remove(channel_name)

    # If there are other channels left, refresh the cache. Otherwise, delete the key completely.
    if channels:
        cache.set(cache_key, channels, timeout=3600)
    else:
        cache.delete(cache_key)
