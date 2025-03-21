import React from 'react';
import { Link } from 'react-router-dom';
import { AppError } from '../services/errorService';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DuplicateFileErrorProps {
  error: AppError;
  onDismiss?: () => void;
}

const DuplicateFileError: React.FC<DuplicateFileErrorProps> = ({ error, onDismiss }) => {
  // Extract duplicate file information from the error details
  const duplicateId = error.details?.duplicate_id || error.details?.data?.duplicate_id;
  const duplicateFilename = error.details?.duplicate_filename || error.details?.data?.duplicate_filename;
  
  if (!duplicateId || !duplicateFilename) {
    return null;
  }
  
  return (
    <div className="bg-amber-50 border border-amber-400 text-amber-700 px-4 py-3 rounded relative mt-3">
      <div className="flex">
        <div className="flex-shrink-0">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium">
            {error.message || "Duplicate file detected"}
          </h3>
          <div className="mt-2 text-sm">
            <p>
              This file appears to be a duplicate of an existing document. 
              You can view the existing document instead:
            </p>
            <div className="mt-3">
              <Link 
                to={`/documents/${duplicateId}`}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
              >
                View "{duplicateFilename}"
              </Link>
            </div>
          </div>
        </div>
      </div>
      
      {onDismiss && (
        <div className="absolute top-0 right-0 px-4 py-3">
          <button 
            type="button" 
            className="text-amber-500 hover:text-amber-700 focus:outline-none"
            onClick={onDismiss}
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default DuplicateFileError; 