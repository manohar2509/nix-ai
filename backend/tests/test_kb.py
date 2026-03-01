"""Tests for Knowledge Base (admin-only) endpoints.

Verifies the complete separation between user documents and KB documents:
  • KB endpoints require admin auth
  • KB uploads go to the KB bucket (not user uploads bucket)
  • KB documents are tracked as KB_DOCUMENT entities (not DOC#)
  • User upload flow does NOT copy to KB bucket
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException


# ════════════════════════════════════════════════════════════════
# Admin gate — all KB routes require admin
# ════════════════════════════════════════════════════════════════
class TestKBAdminGate:
    """All KB endpoints should reject non-admin users."""

    def test_kb_upload_url_requires_admin(self, test_client):
        from app.core.auth import require_admin
        from app.main import app

        async def reject():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[require_admin] = reject
        try:
            response = test_client.get("/kb/upload-url?filename=test.pdf")
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(require_admin, None)

    def test_kb_register_requires_admin(self, test_client):
        from app.core.auth import require_admin
        from app.main import app

        async def reject():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[require_admin] = reject
        try:
            response = test_client.post("/kb/documents", json={
                "name": "test.pdf", "s3_key": "documents/test.pdf", "size": 1024,
            })
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(require_admin, None)

    def test_kb_list_requires_admin(self, test_client):
        from app.core.auth import require_admin
        from app.main import app

        async def reject():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[require_admin] = reject
        try:
            response = test_client.get("/kb/documents")
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(require_admin, None)

    def test_kb_delete_requires_admin(self, test_client):
        from app.core.auth import require_admin
        from app.main import app

        async def reject():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[require_admin] = reject
        try:
            response = test_client.delete("/kb/documents/some-id")
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(require_admin, None)

    def test_kb_sync_requires_admin(self, test_client):
        from app.core.auth import require_admin
        from app.main import app

        async def reject():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[require_admin] = reject
        try:
            response = test_client.post("/kb/sync")
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(require_admin, None)

    def test_kb_stats_requires_admin(self, test_client):
        from app.core.auth import require_admin
        from app.main import app

        async def reject():
            raise HTTPException(status_code=403, detail="Admin access required")

        app.dependency_overrides[require_admin] = reject
        try:
            response = test_client.get("/kb/stats")
            assert response.status_code == 403
        finally:
            app.dependency_overrides.pop(require_admin, None)


# ════════════════════════════════════════════════════════════════
# KB Upload URL — points to KB bucket, not uploads bucket
# ════════════════════════════════════════════════════════════════
class TestKBUploadUrl:
    """KB presigned URL must target the KB bucket."""

    def test_upload_url_returns_kb_bucket_key(self, test_client, mock_user):
        with patch("app.api.routes.kb.kb_service") as mock_svc:
            mock_svc.get_kb_upload_url.return_value = {
                "url": "https://s3.amazonaws.com/nixai-clinical-kb/documents/ref.pdf?X-Amz-...",
                "key": "documents/ref.pdf",
                "expiration": 3600,
            }

            with patch("app.api.routes.kb.require_admin", return_value=mock_user):
                response = test_client.get("/kb/upload-url?filename=ref.pdf")

            assert response.status_code == 200
            data = response.json()
            assert data["key"].startswith("documents/")
            assert "nixai-clinical-kb" in data["url"]
            mock_svc.get_kb_upload_url.assert_called_once_with("ref.pdf", "application/pdf")


# ════════════════════════════════════════════════════════════════
# KB Document Registration
# ════════════════════════════════════════════════════════════════
class TestKBDocumentRegistration:

    def test_register_kb_document(self, test_client, mock_user):
        with patch("app.api.routes.kb.kb_service") as mock_svc, \
             patch("app.api.routes.kb.require_admin", return_value=mock_user):
            mock_svc.register_kb_document.return_value = {
                "id": "kb-001",
                "name": "FDA Guidance 2024.pdf",
                "s3_key": "documents/FDA Guidance 2024.pdf",
                "size": 2048000,
                "description": "FDA regulatory guidance",
                "category": "regulatory",
                "status": "uploaded",
                "uploaded_by": mock_user.user_id,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            }

            response = test_client.post("/kb/documents", json={
                "name": "FDA Guidance 2024.pdf",
                "s3_key": "documents/FDA Guidance 2024.pdf",
                "size": 2048000,
                "description": "FDA regulatory guidance",
                "category": "regulatory",
            })

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "kb-001"
            assert data["category"] == "regulatory"
            assert data["uploaded_by"] == mock_user.user_id

    def test_register_validates_category(self, test_client, mock_user):
        """Category must be one of: regulatory, template, guideline, reference, general."""
        with patch("app.api.routes.kb.require_admin", return_value=mock_user):
            response = test_client.post("/kb/documents", json={
                "name": "test.pdf",
                "s3_key": "documents/test.pdf",
                "size": 1024,
                "category": "invalid_category",  # should fail validation
            })
            assert response.status_code == 422  # Pydantic validation error


# ════════════════════════════════════════════════════════════════
# KB Document List
# ════════════════════════════════════════════════════════════════
class TestKBDocumentList:

    def test_list_kb_documents(self, test_client, mock_user):
        with patch("app.api.routes.kb.kb_service") as mock_svc, \
             patch("app.api.routes.kb.require_admin", return_value=mock_user):
            mock_svc.list_kb_documents.return_value = [
                {"id": "kb-001", "name": "Doc A", "s3_key": "documents/a.pdf",
                 "size": 1000, "description": "", "category": "general",
                 "status": "uploaded", "uploaded_by": "admin-1",
                 "created_at": "2026-01-01", "updated_at": "2026-01-01"},
                {"id": "kb-002", "name": "Doc B", "s3_key": "documents/b.pdf",
                 "size": 2000, "description": "", "category": "regulatory",
                 "status": "uploaded", "uploaded_by": "admin-1",
                 "created_at": "2026-01-02", "updated_at": "2026-01-02"},
            ]

            response = test_client.get("/kb/documents")
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 2
            assert len(data["documents"]) == 2


# ════════════════════════════════════════════════════════════════
# KB Stats
# ════════════════════════════════════════════════════════════════
class TestKBStats:

    def test_kb_stats(self, test_client, mock_user):
        with patch("app.api.routes.kb.kb_service") as mock_svc, \
             patch("app.api.routes.kb.require_admin", return_value=mock_user):
            mock_svc.get_kb_stats.return_value = {
                "total_documents": 5,
                "total_size": 10240000,
                "categories": {"regulatory": 2, "general": 3},
            }

            response = test_client.get("/kb/stats")
            assert response.status_code == 200
            data = response.json()
            assert data["total_documents"] == 5
            assert data["categories"]["regulatory"] == 2


# ════════════════════════════════════════════════════════════════
# Data isolation: User upload MUST NOT touch KB bucket
# ════════════════════════════════════════════════════════════════
class TestDataIsolation:
    """Critical: user documents must never enter the KB bucket."""

    def test_register_user_doc_does_not_copy_to_kb(self, test_client, mock_user):
        """POST /documents should NOT call copy_to_kb_bucket."""
        with patch("app.api.routes.documents.get_current_user", return_value=mock_user), \
             patch("app.api.routes.documents.document_service") as mock_svc, \
             patch("app.services.s3_service.copy_to_kb_bucket") as mock_kb_copy:

            mock_svc.register_document.return_value = {
                "id": "doc-001", "name": "user-trial.pdf",
                "s3_key": "uploads/user-trial.pdf", "size": 5000,
                "status": "uploaded", "created_at": "2026-01-01",
                "updated_at": "2026-01-01", "user_id": mock_user.user_id,
                "analysis_id": None,
            }

            response = test_client.post("/documents", json={
                "name": "user-trial.pdf",
                "s3_key": "uploads/user-trial.pdf",
                "size": 5000,
            })

            assert response.status_code == 200
            # The critical assertion: copy_to_kb_bucket should NEVER be called
            mock_kb_copy.assert_not_called()

    def test_user_upload_url_targets_uploads_bucket(self, test_client, mock_user):
        """GET /upload-url should return a URL for the uploads bucket."""
        with patch("app.api.routes.documents.get_current_user", return_value=mock_user), \
             patch("app.api.routes.documents.document_service") as mock_svc:
            mock_svc.get_presigned_url.return_value = {
                "url": "https://s3.amazonaws.com/nixai-clinical-uploads/uploads/trial.pdf?...",
                "key": "uploads/trial.pdf",
                "expiration": 3600,
            }

            response = test_client.get("/upload-url?filename=trial.pdf")
            assert response.status_code == 200
            data = response.json()
            # Must target uploads bucket, NOT KB bucket
            assert "nixai-clinical-uploads" in data["url"]
            assert "nixai-clinical-kb" not in data["url"]
