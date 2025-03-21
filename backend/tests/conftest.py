import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from app.main import app


@pytest.fixture
def test_client():
    """
    TestClient fixture for making API requests during tests.
    """
    with TestClient(app) as client:
        yield client


@pytest.fixture
def mock_supabase():
    """
    Mock Supabase client for testing.
    """
    with patch("app.db.supabase.get_supabase_client") as mock:
        # Create a mock Supabase client
        mock_client = MagicMock()
        
        # Set up table and storage mocks
        mock_table = MagicMock()
        mock_storage = MagicMock()
        mock_storage_bucket = MagicMock()
        
        # Configure the mock client
        mock_client.table.return_value = mock_table
        mock_client.storage.from_.return_value = mock_storage_bucket
        
        # Configure mock for select method
        mock_select = MagicMock()
        mock_table.select.return_value = mock_select
        
        # Configure mock for execute method
        mock_execute = MagicMock()
        mock_select.execute.return_value = mock_execute
        mock_select.eq.return_value = mock_select
        mock_select.order.return_value = mock_select
        mock_select.range.return_value = mock_select
        
        # Configure mock for insert and delete methods
        mock_table.insert.return_value = mock_select
        mock_table.delete.return_value = mock_select
        
        # Return the configured mock
        mock.return_value = mock_client
        yield mock_client


@pytest.fixture
def sample_file_data():
    """
    Sample file data for testing.
    """
    return {
        "id": 1234567890,
        "filename": "test_document.pdf",
        "content_type": "application/pdf",
        "file_path": "uploaded-files/1234567890/test_document.pdf",
        "content": "This is a test document content.",
        "size": 12345,
        "content_hash": "abcdef1234567890",
        "category_prediction": {"invoice": 0.85, "receipt": 0.10, "other": 0.05},
        "uploaded_at": "2023-10-15T12:34:56.789Z"
    } 