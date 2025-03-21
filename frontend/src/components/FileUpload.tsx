import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadDocument as apiUploadFile, DocumentType } from '../services/api';
import { AppError, ErrorCategory } from '../services/errorService';
import ErrorMessage from './ErrorMessage';
import DuplicateFileError from './DuplicateFileError';
import { DocumentIcon, DocumentTextIcon, CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { toast } from './Toast';

// Maximum file size in bytes (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface FileUploadProps {
  onUploadSuccess: (document: DocumentType) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [isDuplicateFile, setIsDuplicateFile] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(-1);
  
  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;
    
    setUploading(true);
    setError(null);
    setFileValidationError(null);
    setIsDuplicateFile(false);
    
    for (let i = 0; i < selectedFiles.length; i++) {
      try {
        setCurrentUploadIndex(i);
        const file = selectedFiles[i];
        const result = await apiUploadFile(file);
        
        onUploadSuccess(result);
        toast.success(`File "${file.name}" uploaded successfully`);
      } catch (err: any) {
        console.error('Upload error:', err);
        
        // Check for duplicate file error
        if (err.status === 409 || (err.originalError?.response?.status === 409)) {
          setIsDuplicateFile(true);
          
          // Extract duplicate filename from error response if available
          let duplicateInfo = '';
          try {
            const responseData = err.originalError?.response?.data || err.data;
            if (responseData?.data?.duplicate_filename) {
              duplicateInfo = ` as "${responseData.data.duplicate_filename}"`;
            }
          } catch (e) {
            // Ignore parsing errors
          }
          
          setError({
            message: `Document "${selectedFiles[i].name}" has already been uploaded${duplicateInfo}. Each document can only be uploaded once.`,
            category: ErrorCategory.VALIDATION,
            originalError: err
          });
        } 
        // Check for file size error from server validation
        else if (err.code === 'FILE_TOO_LARGE' || 
                (err.originalError?.response?.data?.error === 'FILE_TOO_LARGE')) {
          setFileValidationError(`File "${selectedFiles[i].name}" is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
        }
        // Check for text extraction errors 
        else if (err.code === 'TEXT_EXTRACTION_FAILED' || 
                (err.originalError?.response?.data?.error === 'TEXT_EXTRACTION_FAILED')) {
          if (selectedFiles[i].type === 'application/pdf') {
            setFileValidationError(`Could not extract text from "${selectedFiles[i].name}". The file may be corrupted, password protected, or contain only scanned images.`);
          } else {
            setFileValidationError(`Could not extract text from "${selectedFiles[i].name}". The file may be corrupted or in an unsupported format.`);
          }
        }
        else {
          setError(err);
        }
        
        // Stop on first error
        break;
      }
    }
    
    setUploading(false);
    setCurrentUploadIndex(-1);
    setSelectedFiles([]);
  };

  const handleRetry = () => {
    setError(null);
    setFileValidationError(null);
    setIsDuplicateFile(false);
  };
  
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle file validation errors
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      
      if (rejection.errors[0].code === 'file-too-large') {
        setFileValidationError(`File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
      } else if (rejection.errors[0].code === 'file-invalid-type') {
        setFileValidationError('Invalid file type. Please upload PDF, DOC, DOCX, or TXT files.');
      } else {
        setFileValidationError(rejection.errors[0].message);
      }
      
      return;
    }
    
    // Process the valid files
    if (acceptedFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...acceptedFiles]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: MAX_FILE_SIZE,
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    uploadFiles();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      setSelectedFiles(prev => [...prev, ...fileArray]);
    }
  };

  return (
    <div className="mt-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div 
          {...getRootProps()} 
          className={`bg-[#FFFFFF] border-2 border-dashed ${isDragActive ? 'border-[#4A90E2] bg-blue-50' : 'border-gray-300'} rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200`}
        >
          <input {...getInputProps()} multiple />
          <div className="space-y-1 text-center">
            <DocumentIcon className={`mx-auto h-12 w-12 ${isDragActive ? 'text-[#E2A400]' : 'text-[#4A90E2]'} transition-colors duration-200`} />
            <div className="flex text-sm">
              {isDragActive ? (
                <p className="font-medium text-[#E2A400]">Drop files here</p>
              ) : (
                <>
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer bg-[#FFFFFF] rounded-md font-medium text-[#4A90E2] hover:text-[#E2A400] focus-within:outline-none"
                  >
                    <span>Upload files</span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      onChange={handleFileChange}
                      multiple
                    />
                  </label>
                  <p className="pl-1 text-[#333333]">or drag and drop</p>
                </>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Supported file types: PDF, TXT, DOC, DOCX
            </p>
          </div>
        </div>
        
        {selectedFiles.length > 0 && (
          <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-200">
              {selectedFiles.map((file, index) => (
                <li key={`${file.name}-${index}`} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <DocumentTextIcon className="h-5 w-5 mr-2 text-[#4A90E2]" />
                    <span className="text-sm text-gray-700 truncate max-w-xs">
                      {file.name}
                    </span>
                    {currentUploadIndex === index && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        Uploading...
                      </span>
                    )}
                  </div>
                  {!uploading && (
                    <button 
                      type="button" 
                      onClick={() => removeFile(index)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {fileValidationError && (
          <div className="rounded-md bg-[#F7F7F7] border border-[#E2A400] p-4">
            <div className="flex">
              <ExclamationCircleIcon className="h-5 w-5 text-[#E2A400] mr-2" />
              <span className="text-[#333333]">{fileValidationError}</span>
            </div>
          </div>
        )}
        
        {error && (
          <div className={`rounded-md p-4 ${isDuplicateFile ? 'bg-[#F7F7F7] border border-[#4A90E2]' : 'bg-[#F7F7F7] border border-[#E2A400]'}`}>
            <div className="flex">
              <ExclamationCircleIcon className={`h-5 w-5 mr-2 ${isDuplicateFile ? 'text-[#4A90E2]' : 'text-[#E2A400]'}`} />
              <div>
                <p className="text-[#333333] font-medium">{isDuplicateFile ? 'Duplicate Document' : 'Error'}</p>
                <p className="text-[#333333]">{error.message}</p>
                {isDuplicateFile && (
                  <p className="text-sm text-gray-500 mt-1">
                    The system detected that this document has identical content to an existing document.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="flex justify-end">
          <button
            type="submit"
            className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4A90E2] ${
              selectedFiles.length === 0 || uploading 
                ? 'bg-gray-300 cursor-not-allowed' 
                : 'bg-[#4A90E2] hover:bg-[#E2A400]'
            }`}
            disabled={selectedFiles.length === 0 || uploading}
          >
            {uploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading {currentUploadIndex + 1} of {selectedFiles.length}...
              </>
            ) : (
              `Upload ${selectedFiles.length} ${selectedFiles.length === 1 ? 'Document' : 'Documents'}`
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FileUpload; 