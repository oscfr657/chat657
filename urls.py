from django.urls import path
from django.contrib.auth.decorators import login_required

from . import views

app_name = 'chat657'

urlpatterns = [
    path("", login_required(views.index), name="chat"),
    path("<str:room_name>/", login_required(views.room), name="room"),
    path("<str:room_name>/private/", login_required(views.private), name="private"),
    path("<str:room_name>/video/", login_required(views.video), name="video"),
]
