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
    """Saves a user's channel name in the cache."""
    cache_key = f"user_channel_{site_id}_{username}"
    # Set validity period, for example 1 hour
    cache.set(cache_key, channel_name, timeout=3600)


def get_user_channel(site_id, username):
    """Retrieves a user's channel name from the cache."""
    cache_key = f"user_channel_{site_id}_{username}"
    return cache.get(cache_key)


def remove_user_channel(site_id, username):
    """Removes the user's channel name from the cache."""
    cache_key = f"user_channel_{site_id}_{username}"
    cache.delete(cache_key)
