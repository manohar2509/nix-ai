"""Tests for chat endpoints."""

from unittest.mock import patch, MagicMock


def test_chat_endpoint_returns_response(test_client, mock_user):
    """POST /chat should return an AI response with citations."""
    mock_result = {
        "id": "msg-001",
        "text": "This is a test AI response.",
        "citations": [{"text": "Source 1", "source": "doc.pdf", "section": "1.1", "score": 0.9}],
        "metadata": {"user_message_id": "usr-001", "session_id": None},
    }

    with patch("app.api.routes.chat.get_current_user", return_value=mock_user), \
         patch("app.api.routes.chat.chat_service") as mock_svc:
        mock_svc.send_message.return_value = mock_result

        response = test_client.post("/chat", json={
            "document_id": "doc-123",
            "message": "What are the cardiac risks?",
        })

        assert response.status_code == 200
        data = response.json()
        assert data["text"] == "This is a test AI response."
        assert len(data["citations"]) == 1


def test_chat_requires_message(test_client, mock_user):
    """POST /chat should reject empty messages."""
    with patch("app.api.routes.chat.get_current_user", return_value=mock_user):
        response = test_client.post("/chat", json={"message": ""})
        assert response.status_code == 422  # Validation error
