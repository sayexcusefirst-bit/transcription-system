'use client';

import { useState, useEffect } from 'react';
import { getDocuments, addDocument, deleteDocument } from '@/lib/db';
import { Upload, FileText, Trash2, Clock, Play } from 'lucide-react';
// pdfjsLib will be imported dynamically
let pdfjsLib: any = null;

export default function Home() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    async function initPdf() {
        pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs';
        loadDocuments();
    }
    initPdf();
  }, []);

  async function loadDocuments() {
    setIsLoading(true);
    try {
      const docs = await getDocuments();
      setDocuments(docs.sort((a, b) => b.lastWorkedAt - a.lastWorkedAt));
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file.');
      return;
    }

    setIsUploading(true);
    try {
      // Calculate total pages
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
      const totalPages = pdf.numPages;

      await addDocument(file, totalPages);
      await loadDocuments();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to process PDF file.');
    } finally {
      setIsUploading(false);
      // Reset input
      if (event.target) event.target.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Are you sure you want to delete this document and all its transcriptions?')) {
      await deleteDocument(id);
      await loadDocuments();
    }
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-8 font-sans">
      <header className="max-w-5xl mx-auto mb-12 flex justify-between items-center border-b border-neutral-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Strict Manual Transcription</h1>
          <p className="text-neutral-400">Precision workstation for legacy-font documents</p>
        </div>
        <div>
          <label className={`
            flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 
            text-white font-medium rounded-lg cursor-pointer transition-colors
            ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
          `}>
            <Upload size={20} />
            {isUploading ? 'Processing...' : 'Upload PDF'}
            <input 
              type="file" 
              accept=".pdf" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      </header>

      <main className="max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <FileText size={24} className="text-neutral-400" />
          My Documents
        </h2>

        {isLoading ? (
          <div className="text-center py-12 text-neutral-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-neutral-800 rounded-xl bg-neutral-900/50">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-800 mb-4">
              <FileText size={32} className="text-neutral-500" />
            </div>
            <h3 className="text-xl font-medium text-white mb-2">No documents yet</h3>
            <p className="text-neutral-400 max-w-sm mx-auto">
              Upload a PDF document to begin the transcription process.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 flex items-center justify-between group hover:border-neutral-600 transition-colors">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-white mb-1 flex items-center gap-2">
                    {doc.fileName}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-neutral-400">
                    <span className="flex items-center gap-1">
                      <FileText size={14} />
                      {doc.totalPages} pages
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      Last worked: {new Date(doc.lastWorkedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <a 
                    href={`/workspace/${doc.id}`}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors font-medium"
                  >
                    <Play size={16} />
                    Open Workspace
                  </a>
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-700 rounded-lg transition-colors"
                    title="Delete document"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
