import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDocuments, DocumentType, deleteDocument, reclassifyAllDocuments } from '../services/api';
import { TrashIcon, DocumentTextIcon, ArrowPathIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { toast } from './Toast';

const DocumentList: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReclassifying, setIsReclassifying] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const data = await getDocuments();
      setDocuments(data);
      setError(null);
    } catch (err: any) {
      setError('Error loading documents: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }
    
    try {
      await deleteDocument(id);
      setDocuments(documents.filter(doc => doc.id !== id));
    } catch (err: any) {
      setError('Error deleting document: ' + (err.message || 'Unknown error'));
    }
  };

  const handleReclassifyAll = async () => {
    if (isReclassifying) return;
    
    if (!window.confirm('Are you sure you want to reclassify all documents? This may take some time.')) {
      return;
    }
    
    try {
      setIsReclassifying(true);
      const result = await reclassifyAllDocuments();
      
      if (result.reclassifyStarted) {
        toast.success(`Reclassification of ${result.documentsFound} documents started`);
        // After a delay to allow the backend to process some documents, refresh the list
        setTimeout(() => {
          fetchDocuments();
          setIsReclassifying(false);
        }, 5000);
      } else {
        toast.info('No documents found to reclassify');
        setIsReclassifying(false);
      }
    } catch (err: any) {
      setError('Error reclassifying documents: ' + (err.message || 'Unknown error'));
      setIsReclassifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-[#4A90E2] border-t-transparent rounded-full"></div>
        <span className="ml-3 text-[#333333]">Loading documents...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#F7F7F7] border border-[#E2A400] text-[#333333] px-4 py-3 rounded relative mt-6">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
        <button 
          onClick={fetchDocuments}
          className="absolute top-0 right-0 px-4 py-3"
        >
          <ArrowPathIcon className="h-5 w-5 text-[#E2A400]" />
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="bg-[#F7F7F7] rounded-lg p-6 text-center mt-6">
        <DocumentTextIcon className="h-12 w-12 text-[#4A90E2] mx-auto mb-4" />
        <h3 className="text-lg font-medium text-[#333333]">No documents yet</h3>
        <p className="mt-1 text-sm text-gray-500">Upload your first document to get started.</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-[#333333]">Your Documents</h2>
        <button
          onClick={handleReclassifyAll}
          disabled={isReclassifying}
          className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4A90E2] ${
            isReclassifying ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#4A90E2] hover:bg-[#E2A400]'
          }`}
        >
          {isReclassifying ? (
            <>
              <ArrowPathIcon className="animate-spin h-4 w-4 mr-2" />
              Reclassifying...
            </>
          ) : (
            <>
              <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
              Reclassify All
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto bg-[#FFFFFF] rounded-lg shadow max-w-full">
        <table className="w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-[#F7F7F7]">
            <tr>
              <th scope="col" className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#333333] uppercase tracking-wider w-1/2 md:w-6/12">
                Filename
              </th>
              <th scope="col" className="px-3 sm:px-4 lg:px-6 py-3 text-left text-xs font-medium text-[#333333] uppercase tracking-wider w-2/5 md:w-5/12">
                Classified As
              </th>
              <th scope="col" className="px-3 sm:px-4 lg:px-6 py-3 text-right text-xs font-medium text-[#333333] uppercase tracking-wider w-1/10 md:w-1/12">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-[#FFFFFF] divide-y divide-gray-200">
            {documents.map((doc) => {
              // Find the highest confidence category
              let topCategory = 'Unclassified';
              let topConfidence = 0;
              
              if (doc.category_prediction) {
                Object.entries(doc.category_prediction).forEach(([category, confidence]) => {
                  if (confidence > topConfidence) {
                    topCategory = category;
                    topConfidence = confidence;
                  }
                });
              }
              
              return (
                <tr key={doc.id} className="hover:bg-[#F7F7F7]">
                  <td className="px-3 sm:px-4 lg:px-6 py-3 text-sm">
                    <div className="truncate">
                      <Link to={`/documents/${doc.id}`} className="text-[#4A90E2] hover:text-[#E2A400]">
                        {doc.filename}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 lg:px-6 py-3 text-sm">
                    {topCategory !== 'Unclassified' ? (
                      <div className="flex flex-col sm:flex-row sm:items-center">
                        <span className="px-2 py-1 inline-flex text-sm leading-5 font-medium rounded-lg bg-[#F7F7F7] text-[#4A90E2] truncate max-w-[180px] sm:max-w-[220px] md:max-w-none">
                          {topCategory} 
                        </span>
                        <span className="mt-1 sm:mt-0 sm:ml-2 text-gray-500 text-xs whitespace-nowrap">
                          {(topConfidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    ) : (
                      <span className="px-2 py-1 inline-flex text-sm leading-5 font-medium rounded-lg bg-[#F7F7F7] text-gray-800">
                        {topCategory}
                      </span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 lg:px-6 py-3 text-right text-sm font-medium">
                    <button
                      onClick={(e) => handleDelete(doc.id, e)}
                      className="text-[#E2A400] hover:text-[#4A90E2]"
                      aria-label="Delete document"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DocumentList; 