import pytest
from fastapi.testclient import TestClient
import io
import time
import os
import json
from unittest.mock import patch

from app.main import app
from app.core.config import settings


@pytest.mark.integration
class TestFileWorkflowIntegration:
    """
    Integration tests for the full file upload workflow.
    
    These tests require a real Supabase connection and will
    actually upload, retrieve, and delete files.
    
    To run only these tests:
    pytest -m integration tests/integration/test_file_workflow.py -v
    """
    
    @classmethod
    def setup_class(cls):
        """Setup for all tests in the class"""
        # Verify we have Supabase credentials
        assert settings.SUPABASE_URL, "SUPABASE_URL not set in environment"
        assert settings.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY not set in environment"
        
        # Create test client
        cls.client = TestClient(app)
        
        # Store test files to be deleted
        cls.test_file_ids = []
    
    @classmethod
    def teardown_class(cls):
        """Cleanup after all tests"""
        # Delete any remaining test files
        for file_id in cls.test_file_ids:
            try:
                cls.client.delete(f"/api/v1/files/{file_id}")
            except Exception as e:
                print(f"Error cleaning up test file {file_id}: {str(e)}")
    
    def test_file_upload_and_retrieval(self):
        """Test uploading a text file and then retrieving it"""
        # Create a simple text file
        content = "This is a test document for integration testing."
        file_obj = io.BytesIO(content.encode("utf-8"))
        
        # Upload the file
        timestamp = int(time.time())
        filename = f"test_file_{timestamp}.txt"
        
        response = self.client.post(
            "/api/v1/files/upload/",
            files={"file": (filename, file_obj, "text/plain")}
        )
        
        # Verify upload response
        assert response.status_code == 201, f"Upload failed: {response.text}"
        upload_data = response.json()
        assert upload_data["status"] == "success"
        
        # Store file ID for cleanup
        file_id = upload_data["data"]["id"]
        self.__class__.test_file_ids.append(file_id)
        
        # Verify X-API-Version header
        assert response.headers.get("X-API-Version") == "v1"
        
        # Get the file by ID
        response = self.client.get(f"/api/v1/files/{file_id}")
        assert response.status_code == 200
        file_data = response.json()
        
        # Verify file details
        assert file_data["data"]["id"] == file_id
        assert file_data["data"]["filename"] == filename
        assert file_data["data"]["content_type"] == "text/plain"
        assert content in file_data["data"]["content"]
        
        # Get file list and verify our file is included
        response = self.client.get("/api/v1/files/")
        assert response.status_code == 200
        files_list = response.json()
        
        # Find our file in the list
        found = False
        for file in files_list["data"]:
            if file["id"] == file_id:
                found = True
                break
        
        assert found, "Uploaded file not found in files list"
        
    def test_file_upload_and_delete(self):
        """Test uploading and then deleting a file"""
        # Create a simple text file
        content = "This is a test document for deletion testing."
        file_obj = io.BytesIO(content.encode("utf-8"))
        
        # Upload the file
        timestamp = int(time.time())
        filename = f"test_delete_{timestamp}.txt"
        
        response = self.client.post(
            "/api/v1/files/upload/",
            files={"file": (filename, file_obj, "text/plain")}
        )
        
        # Verify upload
        assert response.status_code == 201
        upload_data = response.json()
        file_id = upload_data["data"]["id"]
        
        # Delete the file
        response = self.client.delete(f"/api/v1/files/{file_id}")
        assert response.status_code == 200
        delete_data = response.json()
        assert delete_data["status"] == "success"
        
        # Verify file is gone
        response = self.client.get(f"/api/v1/files/{file_id}")
        assert response.status_code == 404
        
        # Remove ID from cleanup list since we already deleted it
        if file_id in self.__class__.test_file_ids:
            self.__class__.test_file_ids.remove(file_id)
    
    def test_file_cache_invalidation(self):
        """Test that cache invalidation works for file operations"""
        # Turn on caching for this test
        with patch("app.core.config.settings.CACHE_ENABLED", True):
            # Create a file
            content = "Testing cache invalidation"
            file_obj = io.BytesIO(content.encode("utf-8"))
            
            # Upload the file
            timestamp = int(time.time())
            filename = f"test_cache_{timestamp}.txt"
            
            response = self.client.post(
                "/api/v1/files/upload/",
                files={"file": (filename, file_obj, "text/plain")}
            )
            
            assert response.status_code == 201
            upload_data = response.json()
            file_id = upload_data["data"]["id"]
            self.__class__.test_file_ids.append(file_id)
            
            # First get - should be a cache miss
            response1 = self.client.get(f"/api/v1/files/{file_id}")
            assert response1.status_code == 200
            
            # Second get - should be a cache hit, but result should be the same
            response2 = self.client.get(f"/api/v1/files/{file_id}")
            assert response2.status_code == 200
            assert response2.json() == response1.json()
            
            # Delete the file - should invalidate cache
            response = self.client.delete(f"/api/v1/files/{file_id}")
            assert response.status_code == 200
            
            # Get again - should be a 404 not a cached result
            response3 = self.client.get(f"/api/v1/files/{file_id}")
            assert response3.status_code == 404
            
            # Remove ID from cleanup list since we already deleted it
            if file_id in self.__class__.test_file_ids:
                self.__class__.test_file_ids.remove(file_id) 