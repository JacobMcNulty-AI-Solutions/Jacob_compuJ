import React, { useState } from 'react';
import { XCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { AppError, ErrorCategory, getErrorAction } from '../services/errorService';

interface ErrorMessageProps {
  error: AppError | null | string;
  onRetry?: () => void;
  className?: string;
  showDetails?: boolean;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ 
  error, 
  onRetry, 
  className = '',
  showDetails = false
}) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!error) return null;
  
  // Convert string errors to AppError format
  const appError: AppError = typeof error === 'string' 
    ? { message: error, category: ErrorCategory.UNKNOWN } 
    : error;
    
  // Choose appropriate icon and colors based on error category
  let Icon = XCircleIcon;
  let bgColor = 'bg-red-50';
  let textColor = 'text-red-700';
  let borderColor = 'border-red-400';
  let iconColor = 'text-red-400';
  
  switch (appError.category) {
    case ErrorCategory.VALIDATION:
      Icon = ExclamationTriangleIcon;
      bgColor = 'bg-yellow-50';
      textColor = 'text-yellow-800';
      borderColor = 'border-yellow-400';
      iconColor = 'text-yellow-400';
      break;
    case ErrorCategory.NETWORK:
      Icon = InformationCircleIcon;
      bgColor = 'bg-blue-50';
      textColor = 'text-blue-700';
      borderColor = 'border-blue-400';
      iconColor = 'text-blue-400';
      break;
    case ErrorCategory.FILE_PROCESSING:
      Icon = ExclamationTriangleIcon;
      bgColor = 'bg-orange-50';
      textColor = 'text-orange-700';
      borderColor = 'border-orange-400';
      iconColor = 'text-orange-400';
      break;
    // Other cases remain with default red styling
  }
  
  // Get actionable message
  const action = getErrorAction(appError);
  
  return (
    <div className={`${bgColor} ${borderColor} border ${textColor} px-4 py-3 rounded relative mt-3 ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium">
            {appError.message}
          </h3>
          <div className="mt-2 text-sm">
            <p>{action}</p>
            
            {/* Error details for debugging (expandable in development) */}
            {showDetails && appError.code && (
              <div className="mt-2">
                <button
                  type="button"
                  className="text-sm underline focus:outline-none"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? 'Hide' : 'Show'} technical details
                </button>
                
                {expanded && (
                  <div className="mt-2 p-2 bg-gray-100 rounded text-gray-800 text-xs font-mono">
                    <p>Error code: {appError.code}</p>
                    {appError.details && (
                      <pre className="mt-1 overflow-auto max-h-40">
                        {JSON.stringify(appError.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Retry button if onRetry callback is provided */}
      {onRetry && (
        <div className="absolute top-0 right-0 px-4 py-3">
          <button
            type="button"
            className="text-sm focus:outline-none"
            onClick={onRetry}
            aria-label="Retry"
            title="Retry"
          >
            <ArrowPathIcon className={`h-5 w-5 ${textColor} hover:opacity-75`} />
          </button>
        </div>
      )}
    </div>
  );
};

export default ErrorMessage; 