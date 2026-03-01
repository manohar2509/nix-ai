"""Tests for the health check endpoint."""


def test_health_check(test_client):
    """GET / should return system status."""
    response = test_client.get("/")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "NIX AI System Online"
    assert data["version"] == "1.0.0"
    assert "timestamp" in data


def test_health_check_fields(test_client):
    """Health check should include environment info."""
    response = test_client.get("/")
    data = response.json()
    assert "environment" in data
