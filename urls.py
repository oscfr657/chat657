from django.urls import path
from django.contrib.auth.decorators import login_required

from . import views


urlpatterns = [
    path("", login_required(views.index), name="index"),
    path("<str:room_name>/", login_required(views.room), name="room"),
    path("<str:room_name>/private/", login_required(views.private), name="private"),
]
