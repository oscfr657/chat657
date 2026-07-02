from django.shortcuts import render
from django.db.models import Q
from django.contrib.sites.models import Site
from django.contrib.sites.shortcuts import get_current_site

from .models import Room

try:
    from wagtail.models import Site as WagtailSite
except:
    pass


def get_django_site(request):
    try:
        hostname = WagtailSite.find_for_request(request).hostname
        current_site = Site.objects.filter(domain__icontains=hostname).first()
    except:
        current_site = get_current_site(request)
    return current_site


def index(request):
    # Determine the current site.
    current_site = get_django_site(request)
    
    # Get rooms where the user is an owner OR participant on this site.
    rooms = Room.objects.filter(
        site=current_site
    ).filter(
        Q(owner=request.user) | Q(participants=request.user)
    ).distinct()
    
    # If rooms empty: return access denied!

    return render(request, 'chat657/index.html', {
        'rooms': rooms
    })


def room(request, room_name):
    context = {
        "room_name": room_name,
    }
    return render(request, "chat657/room.html", context)
