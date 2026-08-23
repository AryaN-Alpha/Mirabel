"""
ASGI config for mirabel project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

import django
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mirabel.settings")
django.setup()

# Import routing AFTER django.setup() so app models are ready.
from voice.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    # AllowedHostsOriginValidator checks the WS handshake's Origin header
    # against ALLOWED_HOSTS — without it, any external site can open a
    # connection here and trigger billed LLM/TTS calls (browsers don't
    # enforce CORS for WebSocket connections).
    "websocket": AllowedHostsOriginValidator(AuthMiddlewareStack(URLRouter(websocket_urlpatterns))),
})
