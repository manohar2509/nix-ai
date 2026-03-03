import React, { useState, useEffect } from 'react';
import { FileText, Upload } from 'lucide-react';
import { cn } from '../utils/cn';

export default function EditorWindow({ hasAnalyzed, currentDocument }) {
  const [documentContent, setDocumentContent] = useState(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // Load document content when a document is selected
  useEffect(() => {
    if (!currentDocument?.id) {
      setDocumentContent(null);
      return;
    }

    const loadContent = async () => {
      setIsLoadingContent(true);
      try {
        const { documentService } = await import('../services/documentService');
        const doc = await documentService.getDocument(currentDocument.id);
        setDocumentContent(doc.content || null);
      } catch {
        setDocumentContent(null);
      } finally {
        setIsLoadingContent(false);
      }
    };
    loadContent();
  }, [currentDocument?.id]);

  // Show empty state if no document selected
  if (!currentDocument) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-100/80 to-slate-50 p-8">
        <div className="h-24 w-24 bg-white rounded-2xl flex items-center justify-center mb-5 border border-slate-200 shadow-sm">
          <Upload size={32} className="text-slate-300" />
        </div>
        <h3 className="text-slate-700 font-semibold mb-1">No Protocol Selected</h3>
        <p className="text-slate-400 text-sm max-w-[260px] text-center leading-relaxed">
          Upload a clinical trial protocol or select an existing one from the sidebar to begin regulatory analysis.
        </p>
      </div>
    );
  }

  // Show loading state
  if (isLoadingContent) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-b from-slate-100/80 to-slate-50">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading protocol document...</p>
        </div>
      </div>
    );
  }

  // Error banner helper
  const statusColor = currentDocument?.status === 'analyzed' ? 'text-green-600'
    : currentDocument?.status === 'error' ? 'text-red-600'
    : currentDocument?.status === 'analyzing' ? 'text-amber-600'
    : 'text-slate-600';

  // If we have raw text content from S3, show it in a rendered view
  if (documentContent) {
    return (
      <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-200/60 via-slate-100/80 to-slate-50 p-6 sm:p-8 flex justify-center scroll-smooth">
        <div className="w-full max-w-[800px] relative">
          {/* Error banner */}
          {currentDocument.status === 'error' && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <span className="text-red-600 text-sm font-bold">!</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Analysis failed</p>
                <p className="text-xs text-red-600">Click <strong>Re-run Analysis</strong> in the top bar to try again.</p>
              </div>
            </div>
          )}
          <article className="bg-[#fefcf9] shadow-lg shadow-slate-300/40 border border-slate-200/70 min-h-[800px] relative rounded-lg">
            <div className="px-10 sm:px-14 pt-12 pb-5 border-b border-slate-300/60 bg-gradient-to-b from-white/60 to-transparent">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-mono text-slate-500 uppercase tracking-[0.2em] mb-1.5">Clinical Trial Protocol</p>
                  <h1 className="text-xl font-serif font-bold text-slate-900 leading-snug break-words">
                    {currentDocument.name}
                  </h1>
                </div>
                <div className="text-right font-mono text-[11px] text-slate-500 space-y-1 shrink-0">
                  <div>Status: <span className={cn('font-semibold', statusColor)}>{currentDocument.status}</span></div>
                  <div>Size: <span className="text-slate-700">{currentDocument.size ? `${(currentDocument.size / 1024).toFixed(0)} KB` : '—'}</span></div>
                </div>
              </div>
            </div>
            <div className="px-10 sm:px-14 py-8 font-serif text-[15px] text-slate-800 leading-[2] whitespace-pre-wrap selection:bg-amber-100 selection:text-amber-900">
              {documentContent}
            </div>
          </article>
        </div>
      </div>
    );
  }

  // No extractable text content — show document info card
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-200/60 via-slate-100/80 to-slate-50 p-6 sm:p-8">
      <article className="bg-white shadow-lg shadow-slate-200/40 border border-slate-200/60 rounded-xl max-w-lg w-full p-8 sm:p-10 text-center">
        <div className="h-20 w-20 mx-auto mb-5 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
          <FileText size={36} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">{currentDocument.name}</h3>
        <p className="text-sm text-slate-400 mb-4">
          {currentDocument.size ? `${(currentDocument.size / 1024).toFixed(0)} KB` : '—'} &middot; Status: <span className={cn('font-medium', statusColor)}>{currentDocument.status}</span>
        </p>
        {currentDocument.status === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-sm text-red-700 mb-4">
            <p className="font-medium mb-1">Analysis failed</p>
            <p className="text-red-600 text-xs">Click <strong>Retry Analysis</strong> in the top bar to try again.</p>
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-700">
          <p className="font-medium mb-1">Protocol preview not available</p>
          <p className="text-amber-600 text-xs leading-relaxed">
            This document is a PDF or scanned image. Click <strong>Run Regulatory Analysis</strong> in the top bar to run
            FDA/EMA regulatory &amp; payer compliance analysis — our AI will extract and analyze the full content.
          </p>
        </div>
      </article>
    </div>
  );
}
