from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class MediaGenerationError(Exception):
    """Base exception for all media generation failures."""


class ProviderAuthenticationError(MediaGenerationError):
    """Authentication or credential failure when calling a media provider."""


class ProviderRateLimitError(MediaGenerationError):
    """Rate limit or quota exhaustion from the media provider."""


class ProviderTimeoutError(MediaGenerationError):
    """Operation timed out while communicating with or waiting for the provider."""


class UnsupportedMediaOperation(MediaGenerationError):
    """Operation is not supported by the specified provider."""


class ProviderPolicyRejection(MediaGenerationError):
    """Content moderation or safety policy rejection from the provider."""


class MediaCapability(str, Enum):
    IMAGE_GENERATION = "image_generation"
    VIDEO_GENERATION = "video_generation"
    IMAGE_TO_VIDEO = "image_to_video"
    IMAGE_EDITING = "image_editing"
    VIDEO_EXTEND = "video_extend"


@dataclass
class ProviderImageResult:
    image_bytes: bytes
    mime_type: str = "image/png"
    aspect_ratio: str = "1:1"
    revised_prompt: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProviderVideoJobResult:
    operation_name: str
    status: str = "pending"  # "pending", "processing", "completed", "failed"
    done: bool = False
    video_bytes: bytes | None = None
    mime_type: str = "video/mp4"
    error: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


class MediaProvider(ABC):
    """Abstract base provider for image and video generation."""

    @abstractmethod
    def supports(self, capability: MediaCapability) -> bool:
        """Check if this provider supports the requested capability."""
        raise NotImplementedError

    @abstractmethod
    def generate_image(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        negative_prompt: str = "",
        number_of_images: int = 1,
        **kwargs: Any,
    ) -> list[ProviderImageResult]:
        """Generate one or more images from a text prompt synchronously."""
        raise NotImplementedError

    @abstractmethod
    def start_video_generation(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "16:9",
        duration_seconds: int = 6,
        **kwargs: Any,
    ) -> ProviderVideoJobResult:
        """Initiate asynchronous text-to-video generation."""
        raise NotImplementedError

    @abstractmethod
    def start_image_to_video(
        self,
        image_bytes: bytes,
        mime_type: str,
        *,
        prompt: str = "",
        aspect_ratio: str = "16:9",
        duration_seconds: int = 6,
        **kwargs: Any,
    ) -> ProviderVideoJobResult:
        """Initiate asynchronous image-to-video generation."""
        raise NotImplementedError

    @abstractmethod
    def poll_video_generation(self, operation_name: str) -> ProviderVideoJobResult:
        """Poll the status of an in-flight video generation operation."""
        raise NotImplementedError

    @abstractmethod
    def edit_image(
        self,
        prompt: str,
        base_image_bytes: bytes,
        base_mime_type: str,
        *,
        aspect_ratio: str = "1:1",
        **kwargs: Any,
    ) -> list[ProviderImageResult]:
        """Edit an existing image based on instructions."""
        raise NotImplementedError
