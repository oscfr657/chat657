# Chat657 #

A simple "vibe coded" Django Channels powered text- and video-chat app.

## Requirements ##

* Django
* Django-channels
* Redis or KeyDB with Python-redis

## Tested with ##

```
django==6.0.5
channels==4.3.2
channels-redis==4.3.0
```

## Installation ###

### Install with pip ###

``` bash
pip install -U git+https://github.com/oscfr657/chat657.git@main
```

#### Optional test requirements ####

``` bash
pip install -U daphne
```

### Websocket ###

#### nginx.conf ###

sudo nano /etc/nginx/sites-available/devsite

```
server {
    # WebSocket traffic (requires specific headers)
    location /ws/ {
        proxy_http_version 1.1;
        proxy_pass http://unix:/run/gunicorn.sock;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

``` bash
sudo ln -s /etc/nginx/sites-available/devsite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Gunicorn with uvicorn ####

``` bash
pip install gunicorn uvicorn[standard]
```

``` bash
sudo nano /etc/systemd/system/gunicorn.service
```

``` ini
[Unit]
Description=Gunicorn ASGI service for Django Chat
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/path/to/project

ExecStart=/path/to/project/venv/bin/gunicorn project.asgi:application \
          --worker-class uvicorn_worker.UvicornWorker \
          --workers 4 \
          --bind unix:/sockets/gunicorn.sock

[Install]
WantedBy=multi-user.target
```

``` bash
sudo systemctl start gunicorn
sudo systemctl enable gunicorn
sudo systemctl daemon-reload
```

### Redis ###

#### KeyDB with Python-redis ####

[KeyDB Docs](https://docs.keydb.dev/docs/)

[Install from ppa-deb](https://docs.keydb.dev/docs/ppa-deb)

``` bash
echo "deb https://download.keydb.dev/open-source-dist $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/keydb.list
sudo wget -O /etc/apt/trusted.gpg.d/keydb.gpg https://download.keydb.dev/open-source-dist/keyring.gpg
sudo apt update
sudo apt install keydb
```

### Django settings ###

In the settings file

add your sites to the ALLOWED_HOSTS

and 

add to the INSTALLED_APPS

``` python
INSTALLED_APPS = [
    'django.contrib.sites',  # Don't forget this

    'chat657',
]
```

``` python
ASGI_APPLICATION = 'yourproject.asgi.application'
```

#### Configureation of Redis as Channel Layer ####

``` python
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("127.0.0.1", 6379)],
        },
    },
}
```

#### Set a STUN server to use ####

``` python
STUN_SERVER_URL = "stun:stun.services.mozilla.com:3478"
STUN_SERVER_URL = "stun:stun.l.google.com:19302"
```

### Django url ###

To the django projects' url.py add

``` python
from django.urls import path, include
```

and

``` python
urlpatterns += [
    path("chat/", include("chat657.urls")),
]
```

### Update your project/asgi.py

``` python
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'project.settings')

# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()


from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from chat657.routing import websocket_urlpatterns

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        ),
    }
)
```

### Database configuration ###

``` bash
python manage.py migrate
```

### Collectstatic ###

``` bash
python manage.py collectstatic
```

sudo systemctl daemon-reload

## For development ##

### Testing ###

In the settings file add daphne to the top of the INSTALLED_APPS

``` python
INSTALLED_APPS = [
    'daphne', # Important to be first!
]
```

### Create a new release ###

#### Make migrations ####

``` bash
python manage.py makemigrations
python manage.py migrate
```

#### Run black ####

``` bash
python3 -m venv env 
source env/bin/activate
python -m pip install black
python -m black . -S -t py310 -t py311 -t py312 --extend-exclude .migrations --diff
python -m black . -S -t py310 -t py311 -t py312 --extend-exclude .migrations
```

#### Run tests ####

``` bash 
python manage.py test chat657
```

Update version in VERSION.txt

Update CHANGELOG.md

#### Build release ####

``` bash
python -m pip install build
python -m build --sdist
```

#### Publish to Git ####

``` bash
git commit -a -m 'Changelog message.'
git push
```

## TODO: ##

Improve handle WebRTC
https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling

Add functionality for multiple STUN servers.
https://www.videosdk.live/developer-hub/stun-turn-server/google-stun-server

Add Coturn option
https://github.com/coturn/coturn

Add TURN server settings

``` python
ICESERVERS = {
    'URLS': 'turn:din-server-ip.com:3478',
    'USERNAME': 'din_användare',
    'CREDENTIAL': 'ditt_lösenord',
}
```

Remove need for Daphne when runing tests, check github issue.
https://github.com/django/channels/issues/1942#issuecomment-1420831305
