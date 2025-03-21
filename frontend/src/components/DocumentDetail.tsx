import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDocument, DocumentType } from '../services/api';
import { ArrowLeftIcon, DocumentIcon } from '@heroicons/react/24/outline';

const DocumentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocument = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
          throw new Error('Invalid document ID');
        }
        
        const data = await getDocument(numericId);
        setDocument(data);
      } catch (err: any) {
        setError('Error loading document: ' + (err.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <span className="ml-3 text-gray-700">Loading document details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-6">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mt-6">
        <strong className="font-bold">Not Found!</strong>
        <span className="block sm:inline"> Document not found.</span>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mt-6">
      <div className="flex items-center mb-6">
        <button 
          onClick={() => navigate(-1)} 
          className="text-gray-500 hover:text-gray-700 mr-4"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">Document Details</h2>
      </div>
      
      <div className="flex flex-col md:flex-row">
        <div className="md:w-1/3 p-4 bg-gray-50 rounded-lg mb-4 md:mb-0 md:mr-6">
          <div className="flex justify-center mb-4">
            <DocumentIcon className="h-16 w-16 text-blue-500" />
          </div>
          <h3 className="text-xl font-medium text-gray-900 text-center mb-4">{document.filename}</h3>
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium text-gray-500">Document ID:</span>
              <span className="block text-gray-700">{document.id}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Content Type:</span>
              <span className="block text-gray-700">{document.content_type}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">File Size:</span>
              <span className="block text-gray-700">{document.size !== undefined && document.size !== null ? `${Math.round(document.size / 1024)} KB` : 'Unknown'}</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Uploaded:</span>
              <span className="block text-gray-700">{new Date(document.uploaded_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div className="md:w-2/3">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Document Content</h3>
          {document.content ? (
            <div className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{document.content}</pre>
            </div>
          ) : (
            <div className="bg-gray-50 p-4 rounded-lg text-gray-500">
              No content preview available.
            </div>
          )}

          {document.category_prediction && Object.keys(document.category_prediction).length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Classification</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="space-y-3">
                  {Object.entries(document.category_prediction)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, confidence]) => (
                      <div key={category} className="flex flex-col">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{category}</span>
                          <span className="text-sm text-gray-500">{(confidence * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${confidence * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentDetail; 