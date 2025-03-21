import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import FileUpload from './components/FileUpload';
import DocumentList from './components/DocumentList';
import DocumentDetail from './components/DocumentDetail';
import StatisticalAnalysis from './components/StatisticalAnalysis';
import ChessboardComponent from './components/Chessboard';
import { DocumentType } from './services/api';
import { DocumentTextIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { ToastContainer, toast } from './components/Toast';
import { AppError } from './services/errorService';

function App() {
  const [uploadedDocument, setUploadedDocument] = useState<DocumentType | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<{ message: string; type: string; error?: AppError }[]>([]);

  useEffect(() => {
    // Subscribe to the toast service to show application-wide notifications
    const unsubscribe = toast.addListener((newToast) => {
      setToasts(prev => [...prev, newToast]);
    });
    
    // Clean up subscription on unmount
    return () => unsubscribe();
  }, []);
  
  const handleRemoveToast = (index: number) => {
    setToasts(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadSuccess = (document: DocumentType) => {
    setUploadedDocument(document);
    setRefreshKey(prevKey => prevKey + 1);
    // Show a success toast
    toast.success(`Document "${document.filename}" was successfully uploaded and classified.`);
  };

  return (
    <Router>
      <div className="min-h-screen bg-[#F7F7F7]">
        <header className="bg-[#FFFFFF] shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <Link to="/" className="flex items-center text-[#4A90E2] hover:text-[#E2A400]">
                <DocumentTextIcon className="h-8 w-8 mr-2" />
                <h1 className="text-2xl font-bold">Jacob's Wacky Classifier</h1>
              </Link>
              <nav className="flex space-x-4">
                <NavLink 
                  to="/" 
                  className={({ isActive }) => 
                    isActive 
                      ? "text-[#4A90E2] border-b-2 border-[#4A90E2] px-3 py-2" 
                      : "text-[#333333] hover:text-[#4A90E2] px-3 py-2"
                  }
                  end
                >
                  Home
                </NavLink>
                <NavLink 
                  to="/analysis" 
                  className={({ isActive }) => 
                    isActive 
                      ? "text-[#4A90E2] border-b-2 border-[#4A90E2] px-3 py-2" 
                      : "text-[#333333] hover:text-[#4A90E2] px-3 py-2"
                  }
                >
                  <span className="flex items-center">
                    <ChartBarIcon className="h-5 w-5 mr-1" />
                    Analytics
                  </span>
                </NavLink>
              </nav>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-6 overflow-hidden">
          <Routes>
            <Route 
              path="/" 
              element={
                <div className="space-y-8">
                  {/* Chessboard Component */}
                  <section>
                    <ChessboardComponent />
                  </section>
                  
                  <section>
                    <h2 className="text-xl font-bold text-[#333333]">Upload a Document</h2>
                    <p className="text-gray-500 mt-1">
                      Upload a document to classify it into a category.
                    </p>
                    <FileUpload onUploadSuccess={handleUploadSuccess} />
                  
                    {uploadedDocument && (
                      <div className="mt-6 p-4 bg-[#F7F7F7] border border-[#4A90E2] rounded-lg">
                        <h3 className="text-lg font-medium text-[#4A90E2]">Upload Successful!</h3>
                        <p className="mt-1 text-[#333333]">
                          Your document <span className="font-medium">{uploadedDocument.filename}</span> has been uploaded.
                        </p>
                        <div className="mt-3">
                          <Link 
                            to={`/documents/${uploadedDocument.id}`}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#4A90E2] hover:bg-[#E2A400] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4A90E2]"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    )}
                  </section>
                  
                  <section className="w-full">
                    <DocumentList key={refreshKey} />
                  </section>
                </div>
              } 
            />
            <Route path="/documents/:id" element={<DocumentDetail />} />
            <Route path="/analysis" element={<StatisticalAnalysis />} />
          </Routes>
        </main>
        
        <footer className="bg-[#FFFFFF] border-t border-gray-200 mt-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-gray-500 text-center">
              Jacob's Wacky Classifier &copy; {new Date().getFullYear()}
            </p>
          </div>
        </footer>
        
        {/* Toast container for application-wide notifications */}
        <ToastContainer position="bottom-right" />
    </div>
    </Router>
  );
}

export default App;
