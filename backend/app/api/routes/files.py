from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status, UploadFile, File as FastAPIFile, Form, Query, Path, Depends, Request, BackgroundTasks
import json
import time
import hashlib
from datetime import datetime
from fastapi.responses import JSONResponse

from app.db.supabase import supabase_client, get_supabase_client
from app.models.file import File, FileCreate, FileResponse, FileList
from app.services.document_processor import DocumentProcessor
from app.services.document_classifier import DocumentClassifier
from app.core.exceptions import DocumentNotFound, InvalidFileFormat, StorageError, DatabaseError
from app.core.cache import RedisCache, cached
from app.core.monitoring import PerformanceMonitor
from app.core.config import settings
from app.core.response_model import ResponseModel

# Initialize the document classifier (loads the model)
try:
    document_classifier = DocumentClassifier()
except Exception as e:
    print(f"Error initializing document classifier: {str(e)}")
    # Create a mock classifier for fallback
    class MockClassifier:
        def classify_document(self, text):
            return {"Other": 1.0}
    document_classifier = MockClassifier()

router = APIRouter()


@router.post(
    "/upload/", 
    response_model=FileResponse, 
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document file",
    description="""
    Upload a document file to the system.
    
    Purpose:
    - Process and store document files
    - Extract text content from the file
    - Classify the document into categories
    - Detect duplicate files based on content hash
    
    Input:
    - file: An uploaded file (PDF, DOCX, TXT, etc.)
    
    Output format:
    - Success: JSON with status "success", message, and file data including ID, filename, path, classification results
    - Error: JSON with status "error", error message, error code, and optional details
    
    HTTP Status Codes:
    - 201: File uploaded successfully
    - 400: Invalid file format or validation error
    - 409: Duplicate file detected
    - 500: Storage or database error
    """
)
@PerformanceMonitor.monitor_endpoint
async def upload_file(
    request: Request,
    file: UploadFile = FastAPIFile(..., description="The file to upload"),
    supabase: get_supabase_client = Depends(get_supabase_client)
):
    try:
        # Validate file size
        # Get file size by consuming a chunk
        print("Starting file upload process")
        file_first_chunk = await file.read(1024)  # Read first chunk to check if file is not empty
        if not file_first_chunk:
            raise InvalidFileFormat(
                detail="Uploaded file is empty",
                error_code="EMPTY_FILE"
            )
        
        # Reset file position
        await file.seek(0)
        
        # Read file content
        print("Reading file content")
        file_content = await file.read()
        
        # Check file size
        if len(file_content) > DocumentProcessor.MAX_FILE_SIZE:
            raise InvalidFileFormat(
                detail=f"File size exceeds maximum allowed size of {DocumentProcessor.MAX_FILE_SIZE / 1024 / 1024:.1f}MB",
                error_code="FILE_TOO_LARGE"
            )
            
        # Validate content type
        content_type = file.content_type
        if content_type not in DocumentProcessor.SUPPORTED_CONTENT_TYPES:
            raise InvalidFileFormat(
                detail=f"Unsupported file type: {content_type}. Supported types: {', '.join(DocumentProcessor.SUPPORTED_CONTENT_TYPES.keys())}",
                error_code="UNSUPPORTED_FILE_TYPE"
            )
            
        # Validate file extension
        print("Validating file extension")
        original_filename = file.filename
        _, file_ext = original_filename.lower().rsplit('.', 1) if '.' in original_filename else ('', '')
        expected_extensions = DocumentProcessor.SUPPORTED_CONTENT_TYPES.get(content_type, [])
        if f".{file_ext}" not in expected_extensions:
            raise InvalidFileFormat(
                detail=f"File extension '.{file_ext}' does not match content type {content_type}. Expected: {', '.join(expected_extensions)}",
                error_code="INVALID_FILE_EXTENSION"
            )
        
        # Generate a hash of the file content to check for duplicates
        print("Generating content hash")
        content_hash = hashlib.md5(file_content).hexdigest()
        
        # First extract text content from the file for both duplicate detection and storage
        print("Extracting text content")
        try:
            extracted_text, extraction_error = DocumentProcessor.extract_text(
                file_content, 
                file.content_type,
                file.filename
            )
            
            # If text extraction failed, return an error
            if extraction_error and not extracted_text:
                print(f"Text extraction failed: {extraction_error}")
                print(f"File details: content_type={file.content_type}, filename={file.filename}, size={len(file_content)} bytes")
                
                # If it's a PDF, log specific details
                if file.content_type == "application/pdf":
                    try:
                        # Check if it has PDF header
                        has_pdf_header = file_content.startswith(b'%PDF-')
                        print(f"PDF validation: Has PDF header: {has_pdf_header}")
                        if not has_pdf_header:
                            print(f"Invalid PDF: Missing PDF header signature")
                            
                        # Use the diagnostic function for more detailed information
                        diagnostic = DocumentProcessor.diagnose_pdf(file_content, file.filename)
                        print(f"PDF diagnostic results: {json.dumps(diagnostic)}")
                    except Exception as e:
                        print(f"Error checking PDF details: {str(e)}")
                
                raise InvalidFileFormat(
                    detail=f"Could not extract text from file: {extraction_error}",
                    error_code="TEXT_EXTRACTION_FAILED",
                    details={
                        "content_type": file.content_type,
                        "filename": file.filename,
                        "file_size": len(file_content)
                    }
                )
        except Exception as extract_err:
            print(f"Exception during text extraction: {str(extract_err)}")
            raise InvalidFileFormat(
                detail=f"Error during text extraction: {str(extract_err)}",
                error_code="TEXT_EXTRACTION_ERROR"
            )
        
        # Check for duplicates based on content hash
        print("Checking for duplicates")
        # First check if a file with the same hash already exists
        duplicate_check = supabase.table("files").select("id, filename").eq("content_hash", content_hash).execute()
        if duplicate_check.data and len(duplicate_check.data) > 0:
            # Return information about the duplicate file
            duplicate = duplicate_check.data[0]
            duplicate_id = duplicate["id"]
            duplicate_filename = duplicate["filename"]
            
            # Return direct JSONResponse with 409 status code
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={
                    "status": "error",
                    "message": f"Duplicate file detected. This content has already been uploaded as '{duplicate_filename}'",
                    "data": {
                        "duplicate_id": duplicate_id,
                        "duplicate_filename": duplicate_filename,
                        "content_hash": content_hash
                    }
                }
            )
        
        # Generate a unique file name for storage
        timestamp = int(time.time())
        unique_filename = f"{timestamp}_{content_hash}_{file.filename.replace(' ', '_')}"
        
        # Classify the document text if available
        category_prediction = {"Other": 1.0}  # Default classification
        if extracted_text:
            try:
                print(f"Attempting document classification on text of length {len(extracted_text)}")
                # First check if document classifier is initialized
                if hasattr(document_classifier, 'classify_document') and callable(getattr(document_classifier, 'classify_document')):
                    # Get document classification using the classifier
                    classification_result = document_classifier.classify_document(extracted_text)
                    
                    # Verify result is a valid dictionary
                    if isinstance(classification_result, dict) and len(classification_result) > 0:
                        category_prediction = classification_result
                        print(f"Classification succeeded: {json.dumps(category_prediction)}")
                    else:
                        print(f"Classification returned invalid result: {classification_result}")
                else:
                    print("Document classifier doesn't have classify_document method")
            except Exception as classify_err:
                # If classification fails, log but continue with default prediction
                print(f"Classification error: {str(classify_err)}")
                # Set a default category instead of failing
                category_prediction = {"Other": 1.0}
        
        try:
            # Upload file to Supabase Storage
            print(f"Uploading file to storage: {unique_filename}")
            upload_result = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).upload(
                unique_filename,
                file_content
            )
            
            # UploadResponse is not iterable, check for error differently
            if upload_result is None:
                raise StorageError(
                    detail="Upload failed with null response",
                    error_code="STORAGE_UPLOAD_FAILED"
                )
                
            # Get public URL - if we got here, the upload was successful
            print("Getting public URL")
            file_path = supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).get_public_url(unique_filename)
            
        except Exception as storage_err:
            # If storage upload fails, provide a clear error
            print(f"Storage error: {str(storage_err)}")
            raise StorageError(
                detail=f"Error uploading file to storage: {str(storage_err)}",
                error_code="STORAGE_ERROR"
            )
        
        # Create database record
        print("Preparing database record")
        try:
            # Create file record with classification results
            simple_file_data = {
                "filename": str(file.filename),
                "content_type": str(file.content_type),
                "size": len(file_content),
                "content_hash": content_hash,
                "file_path": file_path,
                "content": extracted_text if extracted_text else "",
                "category_prediction": json.dumps(category_prediction)  # Include classification results
            }
            
            print(f"Using data with classification for database insert: {json.dumps(simple_file_data)}")
            
            # Try insert with the data including classification
            result = supabase.table("files").insert(simple_file_data).execute()
            
            # Check if we got a response with data
            if result and hasattr(result, 'data'):
                print(f"Database insert succeeded with response: {json.dumps(result.data) if result.data else 'empty data'}")
                
                # Even if data is empty, if we didn't get an error, assume it succeeded
                if not result.data:
                    # Return simple success response when data is empty
                    return {
                        "status": "success",
                        "message": "File uploaded successfully",
                        "data": {
                            "filename": file.filename,
                            "content_type": file.content_type,
                            "content_hash": content_hash,
                            "file_path": file_path,
                        }
                    }
                
                # Get the created record if available
                db_file = result.data[0] if result.data and len(result.data) > 0 else None
                
                # If we have a DB file record, use it for response, otherwise use minimal data
                if db_file:
                    # Prepare the response with the db record
                    print("Preparing success response from DB record")
                    try:
                        # Safely parse the category prediction JSON
                        category_prediction_data = {"Other": 1.0}  # Default
                        if db_file.get("category_prediction"):
                            try:
                                if isinstance(db_file["category_prediction"], str):
                                    category_prediction_data = json.loads(db_file["category_prediction"])
                                else:
                                    category_prediction_data = db_file["category_prediction"]
                            except json.JSONDecodeError:
                                print(f"Error parsing JSON from category_prediction: {db_file.get('category_prediction')}")
                        
                        return {
                            "status": "success",
                            "message": "File uploaded successfully",
                            "data": {
                                "id": db_file.get("id"),
                                "filename": db_file.get("filename"),
                                "content_type": db_file.get("content_type"),
                                "size": db_file.get("size"),
                                "content_hash": db_file.get("content_hash"),
                                "file_path": db_file.get("file_path"),
                                "content": db_file.get("content"),
                                "category_prediction": category_prediction_data,
                                "extraction_error": db_file.get("extraction_error"),
                                "uploaded_at": db_file.get("uploaded_at")
                            }
                        }
                    except Exception as resp_err:
                        print(f"Error preparing response from DB: {str(resp_err)}")
                        # Fall back to minimal successful response
                        return {
                            "status": "success",
                            "message": "File uploaded, but error preparing response",
                            "data": {
                                "filename": file.filename,
                                "content_hash": content_hash,
                                "file_path": file_path
                            }
                        }
                else:
                    # Return minimal success response
                    return {
                        "status": "success",
                        "message": "File uploaded successfully",
                        "data": {
                            "filename": file.filename,
                            "content_type": file.content_type,
                            "content_hash": content_hash,
                            "file_path": file_path,
                        }
                    }
            else:
                # No result or no data property
                error_message = "Error inserting file record into database"
                error_details = {"result": str(result)}
                
                print(f"Database error details: {error_details}")
                
                raise DatabaseError(
                    detail=error_message,
                    error_code="DATABASE_INSERT_FAILED",
                    details=error_details
                )
            
        except Exception as db_err:
            # If database insert fails, delete the file from storage
            try:
                supabase.storage.from_(settings.SUPABASE_STORAGE_BUCKET).remove([unique_filename])
            except Exception as cleanup_err:
                # Ignore error when trying to clean up storage
                print(f"Failed to clean up storage after database error: {str(cleanup_err)}")
                pass
                
            # Get more details from the database error
            error_details = {}
            if hasattr(db_err, "response") and hasattr(db_err.response, "json"):
                try:
                    error_json = db_err.response.json()
                    error_details = {"response": error_json}
                    print(f"Database error response: {error_json}")
                except:
                    pass
                    
            raise DatabaseError(
                detail=f"Error storing file metadata: {str(db_err)}",
                error_code="DATABASE_ERROR",
                details=error_details
            )
            
    except InvalidFileFormat as format_err:
        # Return detailed validation errors with 400 status
        error_response = {
            "status": "error",
            "message": str(format_err),
            "error": format_err.error_code,
            "details": getattr(format_err, "details", None)
        }
        print(f"Validation error response: {json.dumps(error_response)}")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_response
        )
        
    except StorageError as storage_err:
        # Return storage errors with 500 status
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "message": str(storage_err),
                "error": storage_err.error_code,
                "details": getattr(storage_err, "details", None)
            }
        )
        
    except DatabaseError as db_err:
        # Return database errors with 500 status
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "message": str(db_err),
                "error": db_err.error_code,
                "details": getattr(db_err, "details", None)
            }
        )
        
    except Exception as e:
        # Catch-all for unexpected errors
        error_detail = str(e)
        error_type = type(e).__name__
        
        # Log the error for debugging
        print(f"Unexpected error during file upload: {error_type} - {error_detail}")
        
        # Return a generic error message
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "message": "An unexpected error occurred while processing your file",
                "error": "UNEXPECTED_ERROR",
                "details": {
                    "error_type": error_type,
                    "error_detail": error_detail if settings.DEBUG else "See server logs for details"
                }
            }
        )


@router.get(
    "/", 
    response_model=FileList,
    summary="Get all files",
    description="""
    Retrieve a list of all uploaded files, ordered by upload date.
    
    Purpose:
    - Get a paginated list of all documents in the system
    - Filter documents by category if needed
    - Provide metadata for each document including classification
    
    Input:
    - limit: Maximum number of files to return (default: 50, range: 1-100)
    - offset: Number of files to skip for pagination (default: 0)
    - category: Optional category name to filter results
    
    Output format:
    - Success: JSON with status "success", data array of file objects, and pagination information
    - Error: DatabaseError exception
    
    HTTP Status Codes:
    - 200: Files retrieved successfully
    - 500: Database error
    """
)
@PerformanceMonitor.monitor_endpoint
@cached(prefix="files:list")
async def get_files(
    request: Request,
    limit: int = Query(50, ge=1, le=100, description="Maximum number of files to return"),
    offset: int = Query(0, ge=0, description="Number of files to skip"),
    category: Optional[str] = Query(None, description="Filter files by predicted category"),
    supabase: get_supabase_client = Depends(get_supabase_client)
):
    try:
        query = supabase.table("files").select("*").order("uploaded_at", desc=True)
        
        # Apply category filter if specified
        if category:
            # Note: This is a simple implementation and might need to be adjusted
            # based on how category predictions are stored
            query = query.filter("category_prediction", "cs", f'%"{category}"%')
            
        # Apply pagination
        query = query.range(offset, offset + limit - 1)
        
        response = query.execute()
        
        # Convert category_prediction strings to JSON objects if they're stored as strings
        files = []
        for file_data in response.data:
            if file_data.get("category_prediction") and isinstance(file_data["category_prediction"], str):
                try:
                    file_data["category_prediction"] = json.loads(file_data["category_prediction"])
                except json.JSONDecodeError:
                    # If it's not valid JSON, keep it as is
                    pass
            files.append(file_data)
            
        # Get total count for pagination
        count_response = supabase.table("files").select("id", count="exact").execute()
        total_count = count_response.count if hasattr(count_response, 'count') else len(files)
        
        return {
            "status": "success",
            "data": files,
            "pagination": {
                "total": total_count,
                "offset": offset,
                "limit": limit,
                "has_more": total_count > (offset + limit)
            }
        }
    except Exception as e:
        raise DatabaseError(f"Error retrieving files: {str(e)}")


@router.get(
    "/{file_id}", 
    response_model=FileResponse,
    summary="Get file by ID",
    description="""
    Retrieve a specific file by its ID.
    
    Purpose:
    - Get detailed information about a specific document
    - Retrieve all metadata including classification results
    - Access file content and storage path
    
    Input:
    - file_id: Numeric ID of the file to retrieve (path parameter)
    
    Output format:
    - Success: JSON with status "success" and data object containing file details
    - Error: DocumentNotFound or DatabaseError exception
    
    HTTP Status Codes:
    - 200: File retrieved successfully
    - 404: File not found
    - 500: Database error
    """
)
@PerformanceMonitor.monitor_endpoint
@cached(prefix="files:detail")
async def get_file(
    request: Request,
    file_id: int = Path(..., description="The ID of the file to retrieve"),
    supabase: get_supabase_client = Depends(get_supabase_client)
):
    try:
        response = supabase.table("files").select("*").eq("id", file_id).execute()
        
        if not response.data:
            raise DocumentNotFound(file_id)
            
        file_data = response.data[0]
        
        # Convert category_prediction to JSON if it's a string
        if file_data.get("category_prediction") and isinstance(file_data["category_prediction"], str):
            try:
                file_data["category_prediction"] = json.loads(file_data["category_prediction"])
            except json.JSONDecodeError:
                pass
                
        return {
            "status": "success", 
            "data": file_data
        }
    except DocumentNotFound:
        raise
    except Exception as e:
        raise DatabaseError(f"Error retrieving file: {str(e)}")


@router.delete(
    "/{file_id}", 
    status_code=status.HTTP_200_OK,
    response_model=dict,
    summary="Delete a file",
    description="""
    Delete a file from storage and database by its ID.
    
    Purpose:
    - Remove a document from the system completely
    - Clean up both storage and database records
    - Clear associated caches
    
    Input:
    - file_id: Numeric ID of the file to delete (path parameter)
    
    Output format:
    - Success: JSON with status "success" and success message
    - Error: DocumentNotFound or DatabaseError exception
    
    HTTP Status Codes:
    - 200: File deleted successfully
    - 404: File not found
    - 500: Database or storage error
    """
)
@PerformanceMonitor.monitor_endpoint
async def delete_file(
    request: Request,
    file_id: int = Path(..., description="The ID of the file to delete"),
    supabase: get_supabase_client = Depends(get_supabase_client)
):
    try:
        # First check if the file exists
        response = supabase.table("files").select("file_path").eq("id", file_id).execute()
        
        if not response.data:
            raise DocumentNotFound(file_id)
            
        file_path = response.data[0].get("file_path")
        
        # Delete from storage if path exists
        if file_path:
            try:
                # Use the configured bucket name for consistency
                storage_bucket = settings.SUPABASE_STORAGE_BUCKET
                # Extract just the filename from the path
                filename = file_path.split("/")[-1]
                supabase.storage.from_(storage_bucket).remove([filename])
            except Exception as e:
                # Log error but continue with database deletion
                print(f"Error removing file from storage: {str(e)}")
        
        # Delete from database
        delete_response = supabase.table("files").delete().eq("id", file_id).execute()
        
        # Clear caches
        if settings.CACHE_ENABLED:
            RedisCache.delete(f"files:detail:{file_id}")
            RedisCache.clear_pattern("files:list:*")
        
        return {
            "status": "success",
            "message": "File deleted successfully"
        }
        
    except DocumentNotFound:
        raise
    except Exception as e:
        raise DatabaseError(f"Error deleting file: {str(e)}")


@router.post(
    "/diagnose-pdf/", 
    status_code=status.HTTP_200_OK,
    summary="Diagnose a PDF file",
    description="""
    Analyze a PDF file to diagnose potential issues without uploading it to storage.
    This endpoint is useful for troubleshooting PDF files that fail to upload.
    
    Input:
    - file: A PDF file to analyze
    
    Output format:
    - Success: JSON with diagnostic information about the PDF
    - Error: Standard error response if the file is not a PDF
    """
)
@PerformanceMonitor.monitor_endpoint
async def diagnose_pdf(
    request: Request,
    file: UploadFile = FastAPIFile(..., description="The PDF file to diagnose")
):
    try:
        # Validate the file is a PDF
        if file.content_type != "application/pdf" and not file.filename.lower().endswith('.pdf'):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "status": "error",
                    "message": "Only PDF files can be diagnosed with this endpoint",
                    "error": "INVALID_FILE_TYPE"
                }
            )
        
        # Read the file content
        file_content = await file.read()
        
        # Run diagnostics
        diagnostic = DocumentProcessor.diagnose_pdf(file_content, file.filename)
        
        # Try extracting text with our main method
        extracted_text, extraction_error = DocumentProcessor.extract_text(
            file_content, 
            file.content_type,
            file.filename
        )
        
        # Add extraction results to the diagnostic
        diagnostic["text_extraction"] = {
            "success": extraction_error is None and bool(extracted_text),
            "error": extraction_error,
            "text_length": len(extracted_text) if extracted_text else 0
        }
        
        # Return the diagnostic results
        return {
            "status": "success",
            "message": "PDF diagnostic complete",
            "data": diagnostic
        }
        
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "message": f"Error diagnosing PDF: {str(e)}",
                "error": "DIAGNOSTIC_ERROR"
            }
        )


@router.post("/reclassify-all/", response_model=ResponseModel[Dict[str, Any]])
async def reclassify_all_documents(
    background_tasks: BackgroundTasks,
    supabase: get_supabase_client = Depends(get_supabase_client)
):
    """
    Reclassify all documents in the database using the current classification model.
    
    This is useful when the classification model or its parameters have been updated.
    The reclassification happens in the background to avoid timeout issues.
    """
    try:
        from app.services.document_classifier import DocumentClassifier
        classifier = DocumentClassifier()
        
        # Get all document IDs and content from the database
        result = supabase.table("files").select("id, content").execute()
        
        if not result.data or len(result.data) == 0:
            return ResponseModel.success(
                message="No documents found to reclassify",
                data={"documents_found": 0, "reclassify_started": False}
            )
        
        # Function to perform reclassification in the background
        async def reclassify_documents():
            for document in result.data:
                try:
                    # Skip documents with no content
                    if not document.get('content'):
                        continue
                        
                    # Reclassify the document
                    prediction = classifier.predict(document['content'])
                    
                    # Update the database with new classification
                    supabase.table("files").update(
                        {"category_prediction": json.dumps(prediction)}
                    ).eq("id", document['id']).execute()
                    
                except Exception as e:
                    print(f"Error reclassifying document {document['id']}: {str(e)}")
                    continue
        
        # Add the reclassification task to background tasks
        background_tasks.add_task(reclassify_documents)
        
        return ResponseModel.success(
            message=f"Reclassification of {len(result.data)} documents started",
            data={"documents_found": len(result.data), "reclassify_started": True}
        )
        
    except Exception as e:
        print(f"Error in reclassify_all_documents: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error starting document reclassification: {str(e)}"
        ) 