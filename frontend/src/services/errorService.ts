import axios, { AxiosError } from 'axios';

// Error categories for different types of errors
export enum ErrorCategory {
  VALIDATION = 'validation',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  FILE_PROCESSING = 'file_processing',
  SERVER = 'server',
  UNKNOWN = 'unknown'
}

// Custom application error interface
export interface AppError {
  message: string;
  category: ErrorCategory;
  code?: string;
  details?: any;
  originalError?: any;
}

// Function to format technical errors into user-friendly messages
export function formatErrorMessage(error: any): AppError {
  // Default error object
  const appError: AppError = {
    message: 'An unexpected error occurred',
    category: ErrorCategory.UNKNOWN,
  };

  // Handle Axios errors (network/API errors)
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    
    // Network errors (no response)
    if (!axiosError.response) {
      appError.category = ErrorCategory.NETWORK;
      appError.message = 'Unable to connect to the server. Please check your internet connection.';
      appError.originalError = axiosError;
      return appError;
    }
    
    // Get response data if available
    const responseData = axiosError.response?.data as any;
    
    // FastAPI often nests error information inside a "detail" field
    const errorDetail = responseData?.detail || responseData;
    
    // Extract error information from the response
    const errorMessage = 
      typeof errorDetail === 'object' ? errorDetail.message : 
      typeof responseData === 'object' ? responseData.message : 
      String(responseData || axiosError.message);
      
    const errorCode = 
      typeof errorDetail === 'object' ? errorDetail.error : 
      typeof responseData === 'object' ? responseData.error : 
      'UNKNOWN_ERROR';
      
    const details = 
      typeof errorDetail === 'object' ? errorDetail.details : 
      typeof responseData === 'object' ? responseData.details : 
      null;
    
    // Handle specific status codes
    switch (axiosError.response?.status) {
      case 400:
        appError.category = ErrorCategory.VALIDATION;
        // Check for specific error codes
        if (errorCode === 'FILE_TOO_LARGE') {
          appError.category = ErrorCategory.FILE_PROCESSING;
          appError.message = errorMessage || 'The file exceeds the maximum allowed size of 10MB.';
        } else if (errorCode === 'TEXT_EXTRACTION_FAILED') {
          appError.category = ErrorCategory.FILE_PROCESSING;
          appError.message = errorMessage || 'Could not extract text from the file. The file may be corrupted or password protected.';
        } else {
          appError.message = errorMessage || 'The request was invalid. Please check your input.';
        }
        appError.code = errorCode || 'BAD_REQUEST';
        break;
      case 401:
      case 403:
        appError.category = ErrorCategory.AUTHENTICATION;
        appError.message = errorMessage || 'You do not have permission to perform this action.';
        appError.code = errorCode || 'UNAUTHORIZED';
        break;
      case 404:
        appError.message = errorMessage || 'The requested resource was not found.';
        appError.code = errorCode || 'NOT_FOUND';
        break;
      case 409:
        // Special handling for duplicates
        appError.category = ErrorCategory.VALIDATION;
        appError.message = errorMessage || 'A duplicate resource was detected.';
        appError.code = errorCode || 'DUPLICATE_RESOURCE';
        appError.details = details || { duplicate: true };
        break;
      case 413:
        appError.category = ErrorCategory.FILE_PROCESSING;
        appError.message = errorMessage || 'The file is too large to upload.';
        appError.code = errorCode || 'FILE_TOO_LARGE';
        break;
      case 415:
        appError.category = ErrorCategory.FILE_PROCESSING;
        appError.message = errorMessage || 'The file type is not supported.';
        appError.code = errorCode || 'UNSUPPORTED_FILE_TYPE';
        break;
      case 429:
        appError.message = errorMessage || 'Too many requests. Please try again later.';
        appError.code = errorCode || 'RATE_LIMIT_EXCEEDED';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        appError.category = ErrorCategory.SERVER;
        appError.message = errorMessage || 'The server encountered an error. Please try again later.';
        appError.code = errorCode || 'SERVER_ERROR';
        break;
      default:
        appError.message = errorMessage || 'An unexpected error occurred';
        appError.code = errorCode || 'UNKNOWN_ERROR';
    }
    
    // Include any additional details from the response
    if (details) {
      appError.details = details;
    }
    
    appError.originalError = axiosError;
  } 
  // Handle specific file processing errors
  else if (error?.message && typeof error.message === 'string') {
    if (error.message.includes('PDF extraction error')) {
      appError.category = ErrorCategory.FILE_PROCESSING;
      appError.message = 'Unable to extract text from PDF. The file may be corrupted or password-protected.';
      appError.code = 'PDF_EXTRACTION_ERROR';
    } else if (error.message.includes('DOCX extraction error')) {
      appError.category = ErrorCategory.FILE_PROCESSING;
      appError.message = 'Unable to extract text from DOCX. The file may be corrupted.';
      appError.code = 'DOCX_EXTRACTION_ERROR';
    } else if (error.message.includes('Error extracting text')) {
      appError.category = ErrorCategory.FILE_PROCESSING;
      appError.message = 'Unable to process the document. Please check the file format.';
      appError.code = 'TEXT_EXTRACTION_ERROR';
    } else if (error.message.includes('file size exceeds')) {
      appError.category = ErrorCategory.FILE_PROCESSING;
      appError.message = 'The file is too large. Maximum file size is 10MB.';
      appError.code = 'FILE_SIZE_EXCEEDED';
    } else if (error.message.includes('file type')) {
      appError.category = ErrorCategory.FILE_PROCESSING;
      appError.message = 'File type not supported. Please upload PDF, DOC, DOCX, or TXT files.';
      appError.code = 'INVALID_FILE_TYPE';
    } else {
      appError.message = error.message;
    }
    
    appError.originalError = error;
  }
  
  return appError;
}

// Function to handle errors and provide retry logic
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options: { 
    retries?: number; 
    retryDelay?: number;
    context?: string;
  } = {}
): Promise<T> {
  const { retries = 0, retryDelay = 1000, context } = options;
  let lastError: any;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Format and log the error
      const formattedError = formatErrorMessage(error);
      console.error(`${context ? `[${context}] ` : ''}Error:`, formattedError);
      
      // For network errors, we might want to retry
      if (
        formattedError.category === ErrorCategory.NETWORK || 
        (axios.isAxiosError(error) && [502, 503, 504].includes(error.response?.status || 0))
      ) {
        if (attempt < retries) {
          console.log(`Retrying (${attempt + 1}/${retries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
      
      // For other errors, don't retry
      break;
    }
  }
  
  // If we've exhausted all retries or it's not a retriable error
  throw formatErrorMessage(lastError);
}

// Export a function to get a user-friendly action based on error
export function getErrorAction(error: AppError): string {
  switch (error.category) {
    case ErrorCategory.NETWORK:
      return 'Check your internet connection and try again.';
    case ErrorCategory.AUTHENTICATION:
      return 'Please log in again to continue.';
    case ErrorCategory.FILE_PROCESSING:
      return 'Try uploading a different file or in a different format.';
    case ErrorCategory.VALIDATION:
      return 'Please review your input and try again.';
    case ErrorCategory.SERVER:
      return 'Please try again later or contact support if the problem persists.';
    default:
      return 'Please try again or contact support if the problem persists.';
  }
}

// Function to extract validation errors from API response
export function extractValidationErrors(error: AppError): Record<string, string> {
  if (error.category === ErrorCategory.VALIDATION && error.details) {
    // Handle different validation error formats
    if (Array.isArray(error.details)) {
      // Handle array of errors
      return error.details.reduce((acc, item) => {
        if (item.loc && item.msg) {
          const field = item.loc[item.loc.length - 1];
          acc[field] = item.msg;
        }
        return acc;
      }, {} as Record<string, string>);
    } else if (typeof error.details === 'object') {
      // Handle object of errors
      return error.details;
    }
  }
  
  return {};
} 