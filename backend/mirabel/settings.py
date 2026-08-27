from pathlib import Path
import os
from dotenv import load_dotenv

# Ensure ffmpeg is in PATH for pydub without needing to restart the IDE/terminal
FFMPEG_DIR = os.getenv("FFMPEG_DIR", "")
if FFMPEG_DIR and os.path.exists(FFMPEG_DIR) and FFMPEG_DIR not in os.environ.get("PATH", ""):
    os.environ["PATH"] += os.pathsep + FFMPEG_DIR

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
# Encrypts ProviderCredential.api_key at rest (see core/models.py).
CREDENTIAL_ENCRYPTION_KEY = os.environ["CREDENTIAL_ENCRYPTION_KEY"]
DEBUG = os.getenv("DEBUG", "False") == "True"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "daphne",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "django_celery_beat",
    "django_celery_results",
    "core",
    "memory",
    "outlook",
    "linkedin",
    "classroom",
    "cv",
    "kanban",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mirabel.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mirabel.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "mirabel"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.environ["DB_PASSWORD"],
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
    }

}

CORS_ALLOWED_ORIGINS = os.getenv(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174"
).split(",")

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

REST_FRAMEWORK = {
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/min",
    },
    "EXCEPTION_HANDLER": "core.exceptions.custom_exception_handler",
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# --- Celery ---
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/1")
CELERY_RESULT_BACKEND = "django-db"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60
CELERY_TASK_SOFT_TIME_LIMIT = 45
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "False") == "True"

# --- ChromaDB ---
CHROMA_HOST = os.getenv("CHROMA_HOST", "127.0.0.1")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8001"))
CHROMA_TENANT = os.getenv("CHROMA_TENANT", "default_tenant")
CHROMA_DATABASE = os.getenv("CHROMA_DATABASE", "default_database")

# --- Memory tuning ---
MEMORY_RETRIEVAL_TOP_K = int(os.getenv("MEMORY_RETRIEVAL_TOP_K", "6"))
MEMORY_RECENCY_HALF_LIFE_DAYS = float(os.getenv("MEMORY_RECENCY_HALF_LIFE_DAYS", "30"))

# --- Outlook / Microsoft Graph ---
# MS_CLIENT_ID / MS_CLIENT_SECRET are deliberately not read here — they're
# read lazily in outlook/services/oauth.py (like ANTHROPIC_API_KEY etc.), so
# a dev without Azure credentials configured can still run the server.
MS_TENANT_ID = os.getenv("MS_TENANT_ID", "common")
MS_REDIRECT_URI = os.getenv("MS_REDIRECT_URI", "http://localhost:8000/api/outlook/auth/callback/")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
OUTLOOK_ALLOWED_SENDER_DOMAIN = os.getenv("OUTLOOK_ALLOWED_SENDER_DOMAIN", "dgtdata.com")

# --- LinkedIn ---
# LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are deliberately not read here —
# they're read lazily in linkedin/services/oauth.py (same reasoning as
# MS_CLIENT_ID/MS_CLIENT_SECRET above), so a dev without a LinkedIn app
# configured can still run the server.
LINKEDIN_REDIRECT_URI = os.getenv("LINKEDIN_REDIRECT_URI", "http://localhost:8000/api/linkedin/auth/callback/")
LINKEDIN_SCOPES = os.getenv("LINKEDIN_SCOPES", "openid profile email w_member_social")
LINKEDIN_API_VERSION = os.getenv("LINKEDIN_API_VERSION", "202608")
# Standard self-serve LinkedIn apps don't get refresh tokens (partner-only
# program) — leave this False unless LinkedIn has granted yours that.
LINKEDIN_ENABLE_REFRESH_TOKEN = os.getenv("LINKEDIN_ENABLE_REFRESH_TOKEN", "False") == "True"

# --- Google Classroom ---
# GOOGLE_CLASSROOM_CLIENT_ID / GOOGLE_CLASSROOM_CLIENT_SECRET are deliberately
# not read here — they're read lazily in classroom/services/oauth.py (same
# reasoning as MS_CLIENT_ID/LINKEDIN_CLIENT_ID above), so a dev without a
# Google Cloud OAuth client configured can still run the server.
GOOGLE_CLASSROOM_REDIRECT_URI = os.getenv(
    "GOOGLE_CLASSROOM_REDIRECT_URI", "http://localhost:8000/api/classroom/auth/callback/"
)
GOOGLE_CLASSROOM_SCOPES = os.getenv(
    "GOOGLE_CLASSROOM_SCOPES",
    "openid https://www.googleapis.com/auth/userinfo.email "
    "https://www.googleapis.com/auth/userinfo.profile "
    "https://www.googleapis.com/auth/classroom.courses.readonly "
    "https://www.googleapis.com/auth/classroom.coursework.me "
    "https://www.googleapis.com/auth/drive.readonly "
    "https://www.googleapis.com/auth/drive.file "
    "https://www.googleapis.com/auth/documents",
)

# --- Media (LinkedIn post images, staged locally before upload) ---
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{asctime} {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": BASE_DIR / "logs" / "mirabel.log",
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "verbose",
            "level": "INFO",
        },
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "loggers": {
        "core": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "memory": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "voice": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "outlook": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "linkedin": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "classroom": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "cv": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
        "kanban": {
            "handlers": ["file", "console"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["file", "console"],
        "level": "WARNING",
    },
}

# --- Channels ---
ASGI_APPLICATION = "mirabel.asgi.application"
CHANNEL_LAYER_REDIS_URL = os.environ.get("CHANNEL_LAYER_REDIS_URL", "")
if CHANNEL_LAYER_REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [CHANNEL_LAYER_REDIS_URL],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

# Add 'channels' and 'voice' to INSTALLED_APPS
INSTALLED_APPS += ["channels", "voice"]

# --- Groq + edge-tts config ---
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_STT_MODEL = os.environ.get("GROQ_STT_MODEL", "whisper-large-v3-turbo")
EDGE_TTS_VOICE = os.environ.get("EDGE_TTS_VOICE", "en-US-JennyNeural")
EDGE_TTS_RATE = os.environ.get("EDGE_TTS_RATE", "+5%")
EDGE_TTS_PITCH = os.environ.get("EDGE_TTS_PITCH", "+2Hz")
