import io
import json
import pytest
from unittest.mock import patch, MagicMock

from fastapi import status
from app.core.exceptions import DocumentNotFound


class TestFileRoutes:
    """Tests for the file routes."""

    def test_get_files(self, test_client, mock_supabase, sample_file_data):
        """Test getting all files."""
        # Configure the mock to return sample data
        mock_execute = mock_supabase.table.return_value.select.return_value.order.return_value.range.return_value.execute.return_value
        mock_execute.data = [sample_file_data]
        
        # Configure count response
        mock_count_response = MagicMock()
        mock_count_response.count = 1
        mock_supabase.table.return_value.select.return_value.execute.return_value = mock_count_response
        
        # Make the request
        response = test_client.get("/api/v1/files/")
        
        # Check the response
        assert response.status_code == status.HTTP_200_OK
        response_data = response.json()
        assert response_data["status"] == "success"
        assert len(response_data["data"]) == 1
        assert response_data["data"][0]["id"] == sample_file_data["id"]
        assert response_data["pagination"]["total"] == 1
        assert response_data["pagination"]["limit"] == 50  # Default limit

    def test_get_file_by_id(self, test_client, mock_supabase, sample_file_data):
        """Test getting a file by ID."""
        # Configure the mock to return sample data
        mock_execute = mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value
        mock_execute.data = [sample_file_data]
        
        # Make the request
        response = test_client.get(f"/api/v1/files/{sample_file_data['id']}")
        
        # Check the response
        assert response.status_code == status.HTTP_200_OK
        response_data = response.json()
        assert response_data["status"] == "success"
        assert response_data["data"]["id"] == sample_file_data["id"]
        assert response_data["data"]["filename"] == sample_file_data["filename"]

    def test_get_file_not_found(self, test_client, mock_supabase):
        """Test getting a file that doesn't exist."""
        # Configure the mock to return no data
        mock_execute = mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value
        mock_execute.data = []
        
        # Make the request
        response = test_client.get("/api/v1/files/999")
        
        # Check the response
        assert response.status_code == status.HTTP_404_NOT_FOUND
        response_data = response.json()
        assert response_data["error"] == "DOCUMENT_NOT_FOUND"
        assert "999" in response_data["message"]

    @patch("app.services.document_processor.DocumentProcessor.extract_text")
    @patch("app.services.document_classifier.DocumentClassifier.classify_document")
    def test_upload_file(self, mock_classify, mock_extract, test_client, mock_supabase, sample_file_data):
        """Test uploading a file."""
        # Configure mocks
        mock_extract.return_value = ("Test document content", None)
        mock_classify.return_value = {"invoice": 0.85, "receipt": 0.10, "other": 0.05}
        
        # Configure the storage mock
        mock_upload = mock_supabase.storage.from_.return_value.upload
        mock_upload.return_value = {"Key": "test-key"}
        
        # Configure the database mock
        mock_execute = mock_supabase.table.return_value.insert.return_value.execute.return_value
        mock_execute.data = [sample_file_data]
        
        # Check that no files exist with similar content (for duplicate check)
        mock_all_files = mock_supabase.table.return_value.select.return_value.execute.return_value
        mock_all_files.data = []
        
        # Create a test file
        test_file = io.BytesIO(b"Test file content")
        
        # Make the request
        response = test_client.post(
            "/api/v1/files/upload/",
            files={"file": ("test.pdf", test_file, "application/pdf")}
        )
        
        # Check the response
        assert response.status_code == status.HTTP_201_CREATED
        response_data = response.json()
        assert response_data["status"] == "success"
        assert response_data["message"] == "File uploaded successfully"
        assert response_data["data"]["id"] == sample_file_data["id"]

    def test_delete_file(self, test_client, mock_supabase, sample_file_data):
        """Test deleting a file."""
        # Configure the mock to find the file
        mock_execute = mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value
        mock_execute.data = [{"file_path": sample_file_data["file_path"]}]
        
        # Configure the delete mock
        mock_delete = mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value
        mock_delete.data = []
        
        # Make the request
        response = test_client.delete(f"/api/v1/files/{sample_file_data['id']}")
        
        # Check the response
        assert response.status_code == status.HTTP_200_OK
        response_data = response.json()
        assert response_data["status"] == "success"
        assert response_data["message"] == "File deleted successfully"
        
        # Verify the remove method was called with the correct path
        mock_remove = mock_supabase.storage.from_.return_value.remove
        mock_remove.assert_called_once_with([sample_file_data["file_path"]]) 