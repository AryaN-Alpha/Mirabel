from rest_framework import serializers

from media_assets.models import MediaAsset, MediaGenerationJob


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.ReadOnlyField()
    thumbnail_url = serializers.ReadOnlyField()

    class Meta:
        model = MediaAsset
        fields = [
            "id",
            "title",
            "prompt",
            "revised_prompt",
            "negative_prompt",
            "media_type",
            "provider",
            "model_name",
            "url",
            "thumbnail_url",
            "aspect_ratio",
            "width",
            "height",
            "duration_seconds",
            "mime_type",
            "file_size_bytes",
            "source_asset",
            "generation_parameters",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "url",
            "thumbnail_url",
            "file_size_bytes",
            "created_at",
            "updated_at",
        ]


class MediaGenerationJobSerializer(serializers.ModelSerializer):
    result_asset = MediaAssetSerializer(read_only=True)

    class Meta:
        model = MediaGenerationJob
        fields = [
            "id",
            "provider",
            "model_name",
            "media_type",
            "prompt",
            "aspect_ratio",
            "duration_seconds",
            "status",
            "celery_task_id",
            "source_asset",
            "result_asset",
            "error_message",
            "progress_percent",
            "parameters",
            "created_at",
            "updated_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "provider",
            "model_name",
            "status",
            "celery_task_id",
            "result_asset",
            "error_message",
            "progress_percent",
            "created_at",
            "updated_at",
            "completed_at",
        ]
