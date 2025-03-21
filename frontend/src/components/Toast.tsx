import React, { useState, useEffect } from 'react';
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { AppError, ErrorCategory } from '../services/errorService';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
  error?: AppError;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  onClose, 
  duration = 5000,
  error
}) => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade-out animation before removing
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration, onClose]);
  
  // Style variants based on type
  let bgColor = 'bg-blue-50';
  let textColor = 'text-blue-800';
  let Icon = InformationCircleIcon;
  
  switch (type) {
    case 'success':
      bgColor = 'bg-green-50';
      textColor = 'text-green-800';
      Icon = CheckCircleIcon;
      break;
    case 'error':
      bgColor = 'bg-red-50';
      textColor = 'text-red-800';
      Icon = ExclamationTriangleIcon;
      break;
    case 'warning':
      bgColor = 'bg-yellow-50';
      textColor = 'text-yellow-800';
      Icon = ExclamationTriangleIcon;
      break;
  }
  
  return (
    <div 
      className={`fixed bottom-4 right-4 flex items-center p-4 mb-4 rounded-lg shadow-lg transition-opacity duration-300 ${bgColor} ${textColor} ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      role="alert"
    >
      <Icon className="flex-shrink-0 w-5 h-5 mr-2" />
      <div className="text-sm font-medium">
        {message}
        {error?.code && (
          <span className="block text-xs opacity-75 mt-1">
            Error code: {error.code}
          </span>
        )}
      </div>
      <button 
        type="button" 
        className={`ml-3 -mx-1.5 -my-1.5 ${bgColor} ${textColor} rounded-lg p-1.5 inline-flex h-8 w-8 focus:outline-none`}
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        aria-label="Close"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

// Toast container to manage multiple toasts
interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  error?: AppError;
}

interface ToastContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ 
  position = 'bottom-right' 
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  // Function to add a toast
  const addToast = (toast: Omit<ToastItem, 'id'>) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { ...toast, id }]);
    return id;
  };
  
  // Function to remove a toast
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };
  
  // Position styles
  let positionClasses = 'bottom-4 right-4';
  switch (position) {
    case 'top-right':
      positionClasses = 'top-4 right-4';
      break;
    case 'top-left':
      positionClasses = 'top-4 left-4';
      break;
    case 'bottom-left':
      positionClasses = 'bottom-4 left-4';
      break;
  }
  
  return (
    <div className={`fixed ${positionClasses} z-50 space-y-4`}>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          error={toast.error}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

// Create a singleton toast service
class ToastService {
  private static instance: ToastService;
  private listeners: ((toast: Omit<ToastItem, 'id'>) => void)[] = [];
  
  private constructor() {}
  
  public static getInstance(): ToastService {
    if (!ToastService.instance) {
      ToastService.instance = new ToastService();
    }
    return ToastService.instance;
  }
  
  public addListener(listener: (toast: Omit<ToastItem, 'id'>) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  public showToast(message: string, type: ToastType, error?: AppError) {
    this.listeners.forEach(listener => listener({ message, type, error }));
  }
  
  public success(message: string) {
    this.showToast(message, 'success');
  }
  
  public error(message: string, error?: AppError) {
    this.showToast(message, 'error', error);
  }
  
  public info(message: string) {
    this.showToast(message, 'info');
  }
  
  public warning(message: string) {
    this.showToast(message, 'warning');
  }
}

export const toast = ToastService.getInstance(); 