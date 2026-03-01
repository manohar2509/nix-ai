"""Tests for document endpoints."""

from unittest.mock import patch


def test_list_documents(test_client, mock_user):
    """GET /documents should return a list."""
    with patch("app.api.routes.documents.get_current_user", return_value=mock_user), \
         patch("app.api.routes.documents.document_service") as mock_svc:
        mock_svc.list_documents.return_value = [
            {"id": "doc-1", "name": "Protocol.pdf", "status": "uploaded", "size": 1024},
        ]

        response = test_client.get("/documents")
        assert response.status_code == 200
        data = response.json()
        assert "documents" in data
        assert len(data["documents"]) == 1


def test_register_document(test_client, mock_user):
    """POST /documents should register a new document."""
    with patch("app.api.routes.documents.get_current_user", return_value=mock_user), \
         patch("app.api.routes.documents.document_service") as mock_svc:
        mock_svc.register_document.return_value = {
            "id": "doc-new",
            "name": "Report.pdf",
            "s3_key": "uploads/Report.pdf",
            "size": 2048,
            "status": "uploaded",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "user_id": "test-user-001",
        }

        response = test_client.post("/documents", json={
            "name": "Report.pdf",
            "s3_key": "uploads/Report.pdf",
            "size": 2048,
        })
        assert response.status_code == 200
        assert response.json()["id"] == "doc-new"


def test_upload_url(test_client, mock_user):
    """GET /upload-url should return a presigned URL."""
    with patch("app.api.routes.documents.get_current_user", return_value=mock_user), \
         patch("app.api.routes.documents.document_service") as mock_svc:
        mock_svc.get_presigned_url.return_value = {
            "url": "https://s3.amazonaws.com/test-bucket/uploads/file.pdf?X-Amz-...",
            "key": "uploads/file.pdf",
            "expiration": 3600,
        }

        response = test_client.get("/upload-url?filename=file.pdf")
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "key" in data
