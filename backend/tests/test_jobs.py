"""Tests for job endpoints."""

from unittest.mock import patch


def test_list_jobs(test_client, mock_user):
    """GET /jobs should return user's jobs."""
    with patch("app.api.routes.jobs.get_current_user", return_value=mock_user), \
         patch("app.api.routes.jobs.job_service") as mock_svc:
        mock_svc.list_jobs.return_value = [
            {"id": "job-1", "jobId": "job-1", "type": "GENERATE_SYNTHETIC", "status": "COMPLETE",
             "params": {}, "result": None, "error": None,
             "progress": {"current": 100, "total": 100, "percent": 100},
             "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"},
        ]

        response = test_client.get("/jobs")
        assert response.status_code == 200
        data = response.json()
        assert "jobs" in data


def test_kb_sync_requires_admin(test_client, mock_user):
    """POST /kb/sync should require admin role — endpoint is on kb router."""
    from fastapi import HTTPException
    from app.core.auth import CurrentUser, require_admin
    from app.main import app

    clinical_user = CurrentUser(
        user_id="clinical-001",
        email="clinical@test.com",
        name="Clinical User",
        groups=["Clinical"],  # NOT Admin
    )

    async def reject_non_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    # Use FastAPI dependency_overrides which is the correct way
    # to override Depends() in test client
    app.dependency_overrides[require_admin] = reject_non_admin
    try:
        response = test_client.post("/kb/sync")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(require_admin, None)


def test_cancel_job(test_client, mock_user):
    """POST /jobs/{id}/cancel should cancel a job."""
    with patch("app.api.routes.jobs.get_current_user", return_value=mock_user), \
         patch("app.api.routes.jobs.job_service") as mock_svc:
        mock_svc.cancel_job.return_value = {"success": True, "jobId": "job-1"}

        response = test_client.post("/jobs/job-1/cancel")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["jobId"] == "job-1"
        mock_svc.cancel_job.assert_called_once_with("job-1")


def test_get_job_status(test_client, mock_user):
    """GET /jobs/{id} should return job details."""
    with patch("app.api.routes.jobs.get_current_user", return_value=mock_user), \
         patch("app.api.routes.jobs.job_service") as mock_svc:
        mock_svc.get_job_status.return_value = {
            "id": "job-1", "jobId": "job-1", "type": "ANALYZE_DOCUMENT",
            "status": "IN_PROGRESS", "params": {}, "result": None,
            "error": None, "progress": {"current": 50, "total": 100, "percent": 50},
            "currentStep": "Analyzing...", "estimatedTimeRemaining": 30,
            "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
            "completedAt": None,
        }

        response = test_client.get("/jobs/job-1")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "IN_PROGRESS"
        assert data["id"] == "job-1"
