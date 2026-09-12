# AI Creative & Media Generation (Google Imagen 3 + Veo 2)

Mirabel includes a provider-agnostic AI Media Generation system supporting image and video creation, image-to-video animation, visual variations, multimodal analysis, and seamless attachment to social media drafts (LinkedIn, Threads).

---

## 1. Architecture Overview

```
                        USER / AGENT / API
                                │
                                ▼
                       MEDIA TOOLS (Agent)
                                │
                                ▼
                         MEDIA SERVICE
                                │
                                ▼
                      PROVIDER ABSTRACTION
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       GoogleMediaProvider             Future Provider
     (Imagen 3 + Veo 2)                (OpenAI DALL-E, etc.)
                 │
                 ▼
       Google GenAI APIs
                 │
                 ▼
        MediaAsset & Files
                 │
   ┌─────────────┼─────────────┐
   ▼             ▼             ▼
Creative     LinkedIn       Threads
 Studio       Drafts         Drafts
```

---

## 2. Configuration & Environment Variables

The Google Media provider reuses the project's existing Gemini API key configuration (`GEMINI_API_KEY` or DB-stored `ProviderCredential(provider="gemini")`). No separate credential is required.

Configure in `.env`:
```ini
# Optional model overrides
GOOGLE_IMAGE_MODEL=imagen-3.0-generate-002
GOOGLE_VIDEO_MODEL=veo-2.0-generate-001
GOOGLE_AI_TIMEOUT=300
GOOGLE_AI_MAX_RETRIES=3

# Celery task limits for async video generation
MEDIA_VIDEO_TASK_TIME_LIMIT=600
MEDIA_VIDEO_TASK_SOFT_TIME_LIMIT=540
```

---

## 3. Data Models (`media_assets/models.py`)

### `MediaAsset`
Stores generated visual assets (images and completed videos):
- `id`: UUID primary key
- `title`, `prompt`, `revised_prompt`, `negative_prompt`
- `media_type`: `"image"` | `"video"`
- `provider`: Provider identifier (e.g. `"google"`)
- `model_name`: Specific model used (e.g. `"imagen-3.0-generate-002"`, `"veo-2.0-generate-001"`)
- `file`: Stored in `MEDIA_ROOT/media_assets/%Y/%m/<uuid>.<ext>`
- `aspect_ratio`: e.g. `"1:1"`, `"16:9"`, `"9:16"`
- `duration_seconds`: Populated for video assets
- `mime_type`, `file_size_bytes`
- `source_asset`: ForeignKey to self for derived assets (variations or image-to-video)
- `generation_parameters`: JSONField

### `MediaGenerationJob`
Tracks asynchronous generation jobs (primarily Veo 2 video generation):
- `id`: UUID primary key
- `status`: `"pending"` | `"processing"` | `"completed"` | `"failed"` | `"cancelled"`
- `operation_name`: Provider long-running operation identifier
- `celery_task_id`: ID of the Celery worker task
- `progress_percent`: Estimated progress percentage (0-100%)
- `result_asset`: Linked `MediaAsset` once completed

---

## 4. API Endpoints

All endpoints are mounted under `/api/media/`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/media/assets/` | List generated assets (filters: `media_type`, `search`) |
| `GET` | `/api/media/assets/<uuid:id>/` | Retrieve asset details |
| `DELETE` | `/api/media/assets/<uuid:id>/` | Delete asset |
| `POST` | `/api/media/generate/image/` | Synchronous image generation (Imagen 3) |
| `POST` | `/api/media/generate/video/` | Asynchronous video generation (Veo 2) |
| `POST` | `/api/media/generate/image-to-video/` | Animate an existing image into video |
| `POST` | `/api/media/assets/<uuid:id>/variations/` | Generate visual variations of an asset |
| `POST` | `/api/media/assets/<uuid:id>/analyze/` | Multimodal analysis using active `ModelPreference` |
| `GET` | `/api/media/jobs/` | List recent generation jobs |
| `GET` | `/api/media/jobs/<uuid:id>/` | Poll generation job status (exempt from rate limits) |

---

## 5. Agent Tools (`agent/tools/media_tools.py`)

Integrated directly into `ALL_TOOLS` and routed through the `"media"` domain in `agent/tools/routing.py`:

1. `generate_image(prompt, aspect_ratio, negative_prompt)`: Synchronous image creation.
2. `generate_video(prompt, aspect_ratio, duration_seconds)`: Asynchronous video generation (returns `job_id` and informs the model to check status later).
3. `generate_image_to_video(source_asset_id, prompt, aspect_ratio, duration_seconds)`: Asynchronous animation.
4. `check_media_job_status(job_id)`: Query job progress and results.
5. `get_media_asset_details(asset_id)`: Inspect asset metadata and URLs.
6. `list_recent_media_assets(media_type, limit)`: List recent assets.
7. `generate_media_variations(asset_id, count)`: Create variations.
8. `analyze_media_asset(asset_id, focus)`: Multimodal visual analysis.
9. `attach_media_to_social_draft(platform, draft_id, asset_id)`: Attaches asset to LinkedIn or Threads drafts without copying files.

---

## 6. Frontend: Creative Studio

Accessible at `/home/creative`:
- **Studio Tab**: Mode switcher (Image, Video, Animate), prompt editor, aspect ratio picker, duration selector, negative prompt, generate button, live visual preview, download, variations, and social draft attachment.
- **Gallery Tab**: Searchable, filterable responsive grid of all generated media with detail modal.
- **Jobs Tab**: Real-time queue view tracking background video generation with progress bars and live polling via `mediaJobPolling.js`.
