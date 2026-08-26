import io
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from pypdf import PdfReader
from rest_framework.test import APITestCase

from cv.models import CVProfile
from cv.schema import empty_sections

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


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


class CvProfileEndpointTests(APITestCase):
    def test_get_creates_default_singleton(self):
        response = self.client.get(reverse("cv-profile"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sections"], empty_sections())
        self.assertFalse(response.data["has_file"])

    def test_put_updates_and_normalizes_sections(self):
        response = self.client.put(reverse("cv-profile"), {"sections": SAMPLE_SECTIONS}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sections"]["personal_info"]["name"], "Jane Doe")
        self.assertEqual(len(response.data["sections"]["experience"]), 2)
        # normalize_sections() stamps every list item with an id
        self.assertTrue(response.data["sections"]["experience"][0]["id"])
        cv = CVProfile.current()
        self.assertEqual(cv.sections["personal_info"]["name"], "Jane Doe")

    def test_put_rejects_non_dict_sections(self):
        response = self.client.put(reverse("cv-profile"), {"sections": "not a dict"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.data)

    def test_put_rejects_missing_sections(self):
        response = self.client.put(reverse("cv-profile"), {}, format="json")
        self.assertEqual(response.status_code, 400)


class CvUploadEndpointTests(APITestCase):
    def test_upload_requires_file(self):
        response = self.client.post(reverse("cv-upload"), {}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_non_pdf(self):
        file = SimpleUploadedFile("resume.txt", b"plain text", content_type="text/plain")
        response = self.client.post(reverse("cv-upload"), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_oversized_file(self):
        big_content = b"%PDF-1.4\n" + b"0" * (MAX_UPLOAD_BYTES + 1)
        file = SimpleUploadedFile("resume.pdf", big_content, content_type="application/pdf")
        response = self.client.post(reverse("cv-upload"), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_corrupted_pdf(self):
        file = SimpleUploadedFile("resume.pdf", b"not actually a pdf", content_type="application/pdf")
        response = self.client.post(reverse("cv-upload"), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["reason"], "unreadable")

    def test_upload_rejects_pdf_with_no_extractable_text(self):
        file = SimpleUploadedFile("resume.pdf", _blank_pdf_bytes(), content_type="application/pdf")
        response = self.client.post(reverse("cv-upload"), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["reason"], "no_text")

    @patch("cv.services.structuring.get_provider")
    def test_upload_structures_cv_on_success(self, mock_get_provider):
        mock_get_provider.return_value.generate_text.return_value = (
            '{"personal_info": {"name": "Jane Doe"}, "summary": "A summary."}'
        )
        file = SimpleUploadedFile(
            "resume.pdf", _make_pdf_bytes(["Jane Doe", "Backend Engineer"]), content_type="application/pdf"
        )
        response = self.client.post(reverse("cv-upload"), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["error"])
        self.assertEqual(response.data["sections"]["personal_info"]["name"], "Jane Doe")
        self.assertTrue(response.data["has_file"])

    @patch("cv.services.structuring.get_provider")
    def test_upload_falls_back_on_provider_error(self, mock_get_provider):
        from core.services.providers import ProviderError

        mock_get_provider.return_value.generate_text.side_effect = ProviderError("no api key configured")
        file = SimpleUploadedFile(
            "resume.pdf", _make_pdf_bytes(["Jane Doe", "Backend Engineer"]), content_type="application/pdf"
        )
        response = self.client.post(reverse("cv-upload"), {"file": file}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["error"])
        self.assertEqual(response.data["reason"], "provider")
        # degraded fallback still carries the raw extracted text forward
        self.assertIn("Jane Doe", response.data["sections"]["summary"])


class CvGenerateSectionEndpointTests(APITestCase):
    def test_unknown_section_type_404(self):
        response = self.client.post(reverse("cv-generate-section", args=["bogus"]), {}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_unsupported_section_type_400(self):
        response = self.client.post(
            reverse("cv-generate-section", args=["summary"]), {"title": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_title_400(self):
        response = self.client.post(reverse("cv-generate-section", args=["projects"]), {}, format="json")
        self.assertEqual(response.status_code, 400)

    @patch("cv.services.generation.ModelPreference")
    @patch("cv.services.generation.get_provider")
    def test_success(self, mock_get_provider, mock_pref):
        mock_get_provider.return_value.generate_text.return_value = "Built a thing with tech."
        response = self.client.post(
            reverse("cv-generate-section", args=["projects"]),
            {"title": "iTags", "tech": "Django", "one_liner": "Asset manager"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["error"])
        self.assertEqual(response.data["text"], "Built a thing with tech.")


class CvRegenerateSectionEndpointTests(APITestCase):
    def test_unknown_section_type_404(self):
        response = self.client.post(reverse("cv-regenerate-section", args=["bogus"]), {}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_missing_current_text_400(self):
        response = self.client.post(
            reverse("cv-regenerate-section", args=["summary"]), {}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    @patch("cv.services.generation.get_provider")
    def test_success(self, mock_get_provider):
        mock_get_provider.return_value.generate_text.return_value = "Rewritten summary."
        response = self.client.post(
            reverse("cv-regenerate-section", args=["summary"]),
            {"current_text": "Old summary.", "instructions": "Make it punchier"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["text"], "Rewritten summary.")


class CvExportPdfEndpointTests(APITestCase):
    def test_export_empty_cv_does_not_crash(self):
        response = self.client.get(reverse("cv-export"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        reader = PdfReader(io.BytesIO(response.content))
        self.assertEqual(len(reader.pages), 1)

    def test_export_populated_cv_fits_one_page_and_has_no_stray_separator(self):
        cv = CVProfile.current()
        cv.sections = SAMPLE_SECTIONS
        cv.save()

        response = self.client.get(reverse("cv-export"))
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
