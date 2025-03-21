import pytest
from fastapi import status
from unittest.mock import patch, MagicMock


class TestMainApp:
    """Tests for the main FastAPI application."""

    def test_health_check(self, test_client):
        """Test the health check endpoint."""
        response = test_client.get("/health")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "environment" in data

    def test_root_redirect(self, test_client):
        """Test the root endpoint redirects to docs."""
        response = test_client.get("/", follow_redirects=False)
        
        assert response.status_code == status.HTTP_307_TEMPORARY_REDIRECT
        assert response.headers["location"] == "/api/docs"

    @patch("app.core.rate_limiter.RateLimiter.is_allowed")
    def test_rate_limiting(self, mock_is_allowed, test_client):
        """Test that rate limiting works."""
        # Configure mock to simulate rate limit exceeded
        mock_is_allowed.return_value = False
        
        # Make a request which should be rate limited
        response = test_client.get("/api/v1/files/")
        
        # Check that we get a 429 Too Many Requests response
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        data = response.json()
        assert data["error"] == "RATE_LIMIT_EXCEEDED"
        assert "rate limit" in data["message"].lower()

    def test_cors_headers(self, test_client):
        """Test that CORS headers are set correctly."""
        # Make a preflight request
        response = test_client.options(
            "/api/v1/files/",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Content-Type",
            }
        )
        
        # Check that CORS headers are set
        assert response.status_code == status.HTTP_200_OK
        assert "access-control-allow-origin" in response.headers
        assert response.headers["access-control-allow-origin"] == "*"  # In test mode, allows all origins

    def test_process_time_header(self, test_client):
        """Test that X-Process-Time header is set."""
        response = test_client.get("/health")
        
        assert response.status_code == status.HTTP_200_OK
        assert "x-process-time" in response.headers
        
        # Verify that the process time is a floating point number
        process_time = float(response.headers["x-process-time"])
        assert process_time > 0 