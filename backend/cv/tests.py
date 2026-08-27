import io
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from pypdf import PdfReader
from rest_framework.test import APITestCase

from cv.models import CVProfile, CvStylePreference
from cv.schema import MAX_FIELD_LENGTH, MAX_URL_LENGTH, default_section_order, empty_sections

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class CvAPITestCase(APITestCase):
    """Base for every test below. The project-wide anon rate throttle
    (30/min, see mirabel/settings.py) is a request counter keyed by client IP
    in the cache (LocMemCache — process-local, not reset between test
    methods by Django's test runner). This suite now covers enough
    endpoints/cases per run that, without a reset, later tests fail with 429
    instead of their expected status purely from earlier tests in the same
    run sharing that counter — not something any individual test is doing
    wrong, so it's cleared once here rather than worked around per test.
    (`override_settings(REST_FRAMEWORK=...)` does NOT work for this: DRF's
    `@api_view`-wrapped views resolve `throttle_classes` from `api_settings`
    once at import time, not per-request, so a runtime settings override
    never reaches them.)"""

    def setUp(self):
        cache.clear()


def _make_pdf_bytes(lines: list[str]) -> bytes:
    """Builds a tiny real single-page PDF with the given lines of text —
    reportlab is already a hard dependency (of xhtml2pdf), so no extra
    library is needed just for test fixtures."""
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    y = 800
    for line in lines:
        c.drawString(72, y, line)
        y -= 20
    c.save()
    return buffer.getvalue()


def _blank_pdf_bytes() -> bytes:
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.showPage()
    c.save()
    return buffer.getvalue()


SAMPLE_SECTIONS = {
    "personal_info": {
        "name": "Jane Doe",
        "title": "Backend Engineer",
        "email": "jane@example.com",
        "phone": "+1 555 0100",
        "location": "Remote",
        "links": [{"label": "GitHub", "url": "https://github.com/janedoe"}],
    },
    "summary": "Backend engineer.",
    "experience": [
        {
            "title": "Engineer",
            "company": "Acme",
            "location": "",
            "start_date": "",
            "end_date": "",
            "bullets": ["Did a thing."],
        },
        {
            "title": "Junior Engineer",
            "company": "Acme Labs",
            "location": "Berlin, Germany",
            "start_date": "",
            "end_date": "",
            "bullets": ["Did another thing."],
        },
    ],
    "education": [],
    "projects": [],
    "skill_groups": [],
    "strengths": [],
    "certifications": [],
}


def _create_cv(name: str = "Main") -> CVProfile:
    return CVProfile.objects.create(name=name)


class CvListEndpointTests(CvAPITestCase):
    def test_list_empty(self):
        response = self.client.get(reverse("cv-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cvs"], [])

    def test_create_requires_name(self):
        response = self.client.post(reverse("cv-list"), {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_create_and_list(self):
        response = self.client.post(reverse("cv-list"), {"name": "Backend-focused"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Backend-focused")
        self.assertEqual(response.data["sections"], empty_sections())

        list_response = self.client.get(reverse("cv-list"))
        self.assertEqual(len(list_response.data["cvs"]), 1)
        self.assertEqual(list_response.data["cvs"][0]["name"], "Backend-focused")
        # list shape is metadata-only, no sections payload
        self.assertNotIn("sections", list_response.data["cvs"][0])


class CvDetailEndpointTests(CvAPITestCase):
    def test_get_unknown_cv_404(self):
        response = self.client.get(reverse("cv-detail", args=[999]))
        self.assertEqual(response.status_code, 404)

    def test_put_updates_and_normalizes_sections(self):
        cv = _create_cv()
        response = self.client.put(reverse("cv-detail", args=[cv.id]), {"sections": SAMPLE_SECTIONS}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sections"]["personal_info"]["name"], "Jane Doe")
        self.assertEqual(len(response.data["sections"]["experience"]), 2)
        # normalize_sections() stamps every list item with an id
        self.assertTrue(response.data["sections"]["experience"][0]["id"])
        cv.refresh_from_db()
        self.assertEqual(cv.sections["personal_info"]["name"], "Jane Doe")

    def test_put_renames(self):
        cv = _create_cv(name="Main")
        response = self.client.put(reverse("cv-detail", args=[cv.id]), {"name": "Full-stack"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Full-stack")

    def test_put_rejects_non_dict_sections(self):
        cv = _create_cv()
        response = self.client.put(reverse("cv-detail", args=[cv.id]), {"sections": "not a dict"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.data)

    def test_put_caps_personal_info_field_length(self):
        cv = _create_cv()
        sections = {**SAMPLE_SECTIONS, "personal_info": {**SAMPLE_SECTIONS["personal_info"], "name": "x" * 1000}}
        response = self.client.put(reverse("cv-detail", args=[cv.id]), {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["sections"]["personal_info"]["name"]), MAX_FIELD_LENGTH)

    def test_put_caps_link_label_and_url_length(self):
        cv = _create_cv()
        sections = {
            **SAMPLE_SECTIONS,
            "personal_info": {
                **SAMPLE_SECTIONS["personal_info"],
                "links": [{"label": "l" * 1000, "url": "https://example.com/" + "a" * 3000}],
            },
        }
        response = self.client.put(reverse("cv-detail", args=[cv.id]), {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 200)
        link = response.data["sections"]["personal_info"]["links"][0]
        self.assertEqual(len(link["label"]), MAX_FIELD_LENGTH)
        self.assertEqual(len(link["url"]), MAX_URL_LENGTH)

    def test_put_dedupes_links_by_url(self):
        cv = _create_cv()
        sections = {
            **SAMPLE_SECTIONS,
            "personal_info": {
                **SAMPLE_SECTIONS["personal_info"],
                "links": [
                    {"label": "GitHub", "url": "https://github.com/janedoe"},
                    # Same URL, different label and trailing slash/case —
                    # should still be treated as a duplicate.
                    {"label": "My GitHub", "url": "HTTPS://GITHUB.COM/janedoe/"},
                    {"label": "LinkedIn", "url": "https://linkedin.com/in/janedoe"},
                ],
            },
        }
        response = self.client.put(reverse("cv-detail", args=[cv.id]), {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 200)
        links = response.data["sections"]["personal_info"]["links"]
        self.assertEqual(len(links), 2)
        self.assertEqual(links[0]["label"], "GitHub")
        self.assertEqual(links[1]["url"], "https://linkedin.com/in/janedoe")

    def test_delete_cv(self):
        cv = _create_cv()
        response = self.client.delete(reverse("cv-detail", args=[cv.id]))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(CVProfile.objects.filter(pk=cv.id).exists())

    def test_a_cv_id_never_leaks_into_another_cvs_sections(self):
        cv_a = _create_cv(name="A")
        cv_b = _create_cv(name="B")
        self.client.put(reverse("cv-detail", args=[cv_a.id]), {"sections": SAMPLE_SECTIONS}, format="json")
        response_b = self.client.get(reverse("cv-detail", args=[cv_b.id]))
        self.assertEqual(response_b.data["sections"], empty_sections())


class CvUploadEndpointTests(CvAPITestCase):
    def test_upload_requires_file(self):
        cv = _create_cv()
        response = self.client.post(reverse("cv-upload", args=[cv.id]), {}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_upload_unknown_cv_404(self):
        response = self.client.post(reverse("cv-upload", args=[999]), {}, format="multipart")
        self.assertEqual(response.status_code, 404)

    def test_upload_rejects_non_pdf(self):
        cv = _create_cv()
        file = SimpleUploadedFile("resume.txt", b"plain text", content_type="text/plain")
        response = self.client.post(reverse("cv-upload", args=[cv.id]), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_oversized_file(self):
        cv = _create_cv()
        big_content = b"%PDF-1.4\n" + b"0" * (MAX_UPLOAD_BYTES + 1)
        file = SimpleUploadedFile("resume.pdf", big_content, content_type="application/pdf")
        response = self.client.post(reverse("cv-upload", args=[cv.id]), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_corrupted_pdf(self):
        cv = _create_cv()
        file = SimpleUploadedFile("resume.pdf", b"not actually a pdf", content_type="application/pdf")
        response = self.client.post(reverse("cv-upload", args=[cv.id]), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["reason"], "unreadable")

    def test_upload_rejects_pdf_with_no_extractable_text(self):
        cv = _create_cv()
        file = SimpleUploadedFile("resume.pdf", _blank_pdf_bytes(), content_type="application/pdf")
        response = self.client.post(reverse("cv-upload", args=[cv.id]), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["reason"], "no_text")

    @patch("cv.services.structuring.get_provider")
    def test_upload_structures_cv_on_success(self, mock_get_provider):
        cv = _create_cv()
        mock_get_provider.return_value.generate_text.return_value = (
            '{"personal_info": {"name": "Jane Doe"}, "summary": "A summary."}'
        )
        file = SimpleUploadedFile(
            "resume.pdf", _make_pdf_bytes(["Jane Doe", "Backend Engineer"]), content_type="application/pdf"
        )
        response = self.client.post(reverse("cv-upload", args=[cv.id]), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["error"])
        self.assertEqual(response.data["sections"]["personal_info"]["name"], "Jane Doe")
        self.assertTrue(response.data["has_file"])

    @patch("cv.services.structuring.get_provider")
    def test_upload_falls_back_on_provider_error(self, mock_get_provider):
        from core.services.providers import ProviderError

        cv = _create_cv()
        mock_get_provider.return_value.generate_text.side_effect = ProviderError("no api key configured")
        file = SimpleUploadedFile(
            "resume.pdf", _make_pdf_bytes(["Jane Doe", "Backend Engineer"]), content_type="application/pdf"
        )
        response = self.client.post(reverse("cv-upload", args=[cv.id]), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["error"])
        self.assertEqual(response.data["reason"], "provider")
        # degraded fallback still carries the raw extracted text forward
        self.assertIn("Jane Doe", response.data["sections"]["summary"])


class CvGenerateSectionEndpointTests(CvAPITestCase):
    def test_unknown_cv_404(self):
        response = self.client.post(reverse("cv-generate-section", args=[999, "projects"]), {}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_unknown_section_type_404(self):
        cv = _create_cv()
        response = self.client.post(reverse("cv-generate-section", args=[cv.id, "bogus"]), {}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_unsupported_section_type_400(self):
        cv = _create_cv()
        response = self.client.post(
            reverse("cv-generate-section", args=[cv.id, "summary"]), {"title": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_title_400(self):
        cv = _create_cv()
        response = self.client.post(reverse("cv-generate-section", args=[cv.id, "projects"]), {}, format="json")
        self.assertEqual(response.status_code, 400)

    @patch("cv.services.generation.ModelPreference")
    @patch("cv.services.generation.get_provider")
    def test_success(self, mock_get_provider, mock_pref):
        cv = _create_cv()
        mock_get_provider.return_value.generate_text.return_value = "Built a thing with tech."
        response = self.client.post(
            reverse("cv-generate-section", args=[cv.id, "projects"]),
            {"title": "iTags", "tech": "Django", "one_liner": "Asset manager"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["error"])
        self.assertEqual(response.data["text"], "Built a thing with tech.")


class CvRegenerateSectionEndpointTests(CvAPITestCase):
    def test_unknown_cv_404(self):
        response = self.client.post(reverse("cv-regenerate-section", args=[999, "summary"]), {}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_unknown_section_type_404(self):
        cv = _create_cv()
        response = self.client.post(reverse("cv-regenerate-section", args=[cv.id, "bogus"]), {}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_missing_current_text_400(self):
        cv = _create_cv()
        response = self.client.post(
            reverse("cv-regenerate-section", args=[cv.id, "summary"]), {}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    @patch("cv.services.generation.get_provider")
    def test_success(self, mock_get_provider):
        cv = _create_cv()
        mock_get_provider.return_value.generate_text.return_value = "Rewritten summary."
        response = self.client.post(
            reverse("cv-regenerate-section", args=[cv.id, "summary"]),
            {"current_text": "Old summary.", "instructions": "Make it punchier"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["text"], "Rewritten summary.")

    def test_a_stale_section_regenerate_on_another_cv_404s(self):
        # A section-type is valid, but scoping is by cv_id in the URL path —
        # an unknown cv_id must 404 regardless of section_type validity.
        response = self.client.post(
            reverse("cv-regenerate-section", args=[999, "summary"]),
            {"current_text": "Old summary."},
            format="json",
        )
        self.assertEqual(response.status_code, 404)


class CvExportPdfEndpointTests(CvAPITestCase):
    def test_export_unknown_cv_404(self):
        response = self.client.get(reverse("cv-export", args=[999]))
        self.assertEqual(response.status_code, 404)

    def test_export_empty_cv_does_not_crash(self):
        cv = _create_cv()
        response = self.client.get(reverse("cv-export", args=[cv.id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        reader = PdfReader(io.BytesIO(response.content))
        self.assertEqual(len(reader.pages), 1)

    def test_export_populated_cv_fits_one_page_and_has_no_stray_separator(self):
        cv = _create_cv()
        cv.sections = SAMPLE_SECTIONS
        cv.save()

        response = self.client.get(reverse("cv-export", args=[cv.id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Disposition"], 'attachment; filename="cv.pdf"')

        reader = PdfReader(io.BytesIO(response.content))
        # Regression guard for the xhtml2pdf default-div-margin bug: every
        # block element used to inherit an unwanted ~1em top/bottom margin,
        # which alone was enough to push this small a CV onto two pages.
        self.assertEqual(len(reader.pages), 1)

        text = reader.pages[0].extract_text()
        # Regression guard for the entry-sub separator bug: a location with
        # no start/end date used to render with a stray leading "• ".
        self.assertIn("Berlin, Germany", text)
        self.assertNotIn("• Berlin, Germany", text)


class CvStylePreferenceEndpointTests(CvAPITestCase):
    def test_get_creates_default_singleton(self):
        response = self.client.get(reverse("cv-style-preference"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["font_choice"], CvStylePreference.DEFAULT_FONT)
        self.assertEqual(response.data["theme_choice"], CvStylePreference.DEFAULT_THEME)
        self.assertEqual(response.data["template_choice"], CvStylePreference.DEFAULT_TEMPLATE)
        self.assertEqual(response.data["section_order"], default_section_order())
        self.assertIn("fonts", response.data["available"])
        self.assertIn("themes", response.data["available"])
        self.assertIn("templates", response.data["available"])

    def test_put_updates_font_and_theme(self):
        response = self.client.put(
            reverse("cv-style-preference"),
            {"font_choice": "lora", "theme_choice": "midnight-blue"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["font_choice"], "lora")
        self.assertEqual(response.data["theme_choice"], "midnight-blue")
        # template_choice/section_order weren't in the PUT body — untouched
        self.assertEqual(response.data["template_choice"], CvStylePreference.DEFAULT_TEMPLATE)
        pref = CvStylePreference.current()
        self.assertEqual(pref.font_choice, "lora")

    def test_put_rejects_unknown_font(self):
        response = self.client.put(reverse("cv-style-preference"), {"font_choice": "comic-sans"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_put_rejects_unknown_theme(self):
        response = self.client.put(reverse("cv-style-preference"), {"theme_choice": "bogus"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_put_rejects_unknown_template(self):
        response = self.client.put(reverse("cv-style-preference"), {"template_choice": "bogus"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_put_accepts_permuted_section_order(self):
        order = {
            "main": ["experience", "summary", "certifications", "projects"],
            "sidebar": ["education", "strengths", "skills"],
        }
        response = self.client.put(reverse("cv-style-preference"), {"section_order": order}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["section_order"], order)

    def test_put_rejects_section_order_missing_a_key(self):
        order = {
            "main": ["experience", "summary", "certifications"],  # missing "projects"
            "sidebar": ["education", "strengths", "skills"],
        }
        response = self.client.put(reverse("cv-style-preference"), {"section_order": order}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_put_rejects_section_order_with_foreign_key(self):
        order = {
            "main": ["experience", "summary", "certifications", "bogus"],
            "sidebar": ["education", "strengths", "skills"],
        }
        response = self.client.put(reverse("cv-style-preference"), {"section_order": order}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_put_rejects_section_order_missing_a_column(self):
        response = self.client.put(
            reverse("cv-style-preference"), {"section_order": {"main": default_section_order()["main"]}}, format="json"
        )
        self.assertEqual(response.status_code, 400)
