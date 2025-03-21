import axios from 'axios';

const API_URL = 'http://localhost:8000/api/v1';

export interface DocumentType {
  id: number;
  filename: string;
  content_type: string;
  file_path: string;
  size?: number;
  content?: string;
  category_prediction?: Record<string, number>;
  uploaded_at: string;
}

export interface PaginationInfo {
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface ApiResponse<T> {
  status: string;
  message?: string;
  data: T;
  pagination?: PaginationInfo;
}

// File upload service
export const uploadDocument = async (file: File): Promise<DocumentType> => {
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await axios.post<ApiResponse<DocumentType>>(`${API_URL}/files/upload/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    if (response.data.status === 'success' && response.data.data) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Unknown error');
    }
  } catch (error: any) {
    console.error('Error uploading document:', error);
    
    // Enhance error object with any specific API error codes and messages
    if (error.response?.data) {
      const apiError = error.response.data;
      // Add error code if it exists in the response
      if (apiError.error) {
        error.code = apiError.error;
      }
      // Add detailed message if available
      if (apiError.message) {
        error.message = apiError.message;
      }
      // Add details if available
      if (apiError.details) {
        error.details = apiError.details;
      }
    }
    
    throw error;
  }
};

// Get all documents
export const getDocuments = async (): Promise<DocumentType[]> => {
  try {
    console.log("Fetching documents from API:", `${API_URL}/files`);
    const response = await axios.get<ApiResponse<DocumentType[]>>(`${API_URL}/files`);
    
    if (response.data.status === 'success' && response.data.data) {
      // Need to convert category_prediction from string to object if it's a string
      return response.data.data.map(doc => {
        if (doc.category_prediction && typeof doc.category_prediction === 'string') {
          try {
            doc.category_prediction = JSON.parse(doc.category_prediction as unknown as string);
          } catch (e) {
            console.error('Error parsing category_prediction:', e);
          }
        }
        return doc;
      });
    } else {
      throw new Error(response.data.message || 'Failed to fetch documents');
    }
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
};

// Get a specific document by ID
export const getDocument = async (id: number): Promise<DocumentType> => {
  try {
    const response = await axios.get<ApiResponse<DocumentType>>(`${API_URL}/files/${id}`);
    
    if (response.data.status === 'success' && response.data.data) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Document not found');
    }
  } catch (error) {
    console.error(`Error fetching document ${id}:`, error);
    throw error;
  }
};

// Delete a document
export const deleteDocument = async (id: number): Promise<void> => {
  try {
    await axios.delete(`${API_URL}/files/${id}`);
  } catch (error) {
    console.error(`Error deleting document ${id}:`, error);
    throw error;
  }
};

// Reclassify all documents
export const reclassifyAllDocuments = async (): Promise<{documentsFound: number; reclassifyStarted: boolean}> => {
  try {
    const response = await axios.post<ApiResponse<{documents_found: number; reclassify_started: boolean}>>(`${API_URL}/files/reclassify-all/`);
    
    if (response.data.status === 'success' && response.data.data) {
      return {
        documentsFound: response.data.data.documents_found,
        reclassifyStarted: response.data.data.reclassify_started
      };
    } else {
      throw new Error(response.data.message || 'Failed to start reclassification');
    }
  } catch (error) {
    console.error('Error reclassifying documents:', error);
    throw error;
  }
}; 