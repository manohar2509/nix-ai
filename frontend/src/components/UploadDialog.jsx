import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import documentService from '../services/documentService';
import { analysisService } from '../services/analysisService';
import { cn } from '../utils/cn';

/**
 * Document Upload Dialog
 * 
 * User flow:
 * 1. Select a supported file (PDF, TXT, DOCX, CSV, JSON)
 * 2. Get presigned URL from backend
 * 3. Upload directly to S3 (shows progress)
 * 4. Register document in metadata DB
 * 5. Close modal + add to documents list
 */

const ACCEPTED_TYPES = {
  'application/pdf': true,
  'text/plain': true,
  'text/csv': true,
  'application/json': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/msword': true,
};
const ACCEPTED_EXTENSIONS = '.pdf,.txt,.csv,.json,.docx,.doc';

// Derive content type from extension when file.type is empty (some browsers)
const EXTENSION_TO_MIME = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

function resolveContentType(file) {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return EXTENSION_TO_MIME[ext] || 'application/octet-stream';
}

export function UploadDialog({ isOpen, onClose }) {
  const fileInputRef = useRef(null);
  const abortRef = useRef(null); // Tracks in-flight XHR for cancellation
  
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const addDocument = useAppStore((state) => state.addDocument);
  const showToast = useAppStore((state) => state.showToast);
  const setCurrentDocument = useAppStore((state) => state.setCurrentDocument);

  const validateFile = (selected) => {
    if (!selected) return false;
    const ext = selected.name.split('.').pop()?.toLowerCase();
    const validExts = ['pdf', 'txt', 'csv', 'json', 'docx', 'doc'];
    if (!ACCEPTED_TYPES[selected.type] && !validExts.includes(ext)) {
      setError('Unsupported file type. Accepted: PDF, TXT, CSV, JSON, DOCX');
      return false;
    }
    if (selected.size > 50 * 1024 * 1024) {
      setError('File size exceeds 50MB limit');
      return false;
    }
    return true;
  };

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (validateFile(selected)) {
      setFile(selected);
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (validateFile(dropped)) {
      setFile(dropped);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Step 1: Get presigned URL (use resolved content type for empty file.type)
      const contentType = resolveContentType(file);
      console.log('Getting presigned URL for:', file.name, 'type:', contentType);
      const { url, key } = await documentService.getPresignedUrl(
        file.name,
        contentType
      );

      // Step 2: Upload to S3 with progress tracking
      console.log('Uploading to S3...');
      const uploadPromise = documentService.uploadToS3(file, url, (progress) => {
        setUploadProgress(progress);
      }, contentType);
      abortRef.current = uploadPromise.abort; // Store abort handle for cancellation
      await uploadPromise;
      abortRef.current = null;

      // Step 3: Register document in metadata DB
      console.log('Registering document in metadata DB...');
      const doc = await documentService.registerDocument(
        file.name,
        key,
        file.size
      );

      // Step 4: Update UI
      addDocument(doc);
      setCurrentDocument(doc);

      // Step 5: Auto-analyze if preference is enabled
      let autoAnalyzed = false;
      try {
        const storedPrefs = localStorage.getItem('nixai-user-preferences');
        if (storedPrefs) {
          const prefs = JSON.parse(storedPrefs);
          if (prefs.autoAnalyzeOnUpload && doc.id) {
            await analysisService.triggerAnalysis(doc.id);
            autoAnalyzed = true;
          }
        }
      } catch (autoErr) {
        console.warn('Auto-analyze failed:', autoErr);
      }

      // Show success
      showToast({
        type: 'success',
        title: 'Upload successful',
        message: autoAnalyzed
          ? `${file.name} uploaded and analysis started automatically`
          : `${file.name} is ready for analysis`,
      });

      // Close dialog
      handleClose();
    } catch (err) {
      console.error('Upload failed:', err);
      // Provide a specific error if possible, otherwise generic
      const errorMessage = err.message === 'Upload cancelled'
        ? 'Upload was cancelled.'
        : err.message || 'Upload could not be completed. Please try again.';
      setError(errorMessage);
      if (err.message !== 'Upload cancelled') {
        showToast({
          type: 'error',
          title: 'Upload unsuccessful',
          message: 'Something went wrong during the upload. Please try again.',
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    // Abort any in-flight S3 upload to prevent phantom documents
    if (abortRef.current) {
      try { abortRef.current(); } catch { /* ignore abort errors */ }
      abortRef.current = null;
    }
    setFile(null);
    setUploadProgress(0);
    setError(null);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Upload Clinical Trial Protocol</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* File input area */}
          {!file ? (
            <label
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
                isDragging
                  ? 'border-brand-500 bg-brand-50/50'
                  : 'border-slate-200 hover:border-brand-400 hover:bg-brand-50/30'
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700">
                {isDragging ? 'Drop protocol file here' : 'Click or drag to upload your protocol'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supported formats: PDF, TXT, CSV, JSON, DOCX — Max 50 MB
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                Upload your clinical trial protocol, investigator’s brochure, statistical analysis plan, or other trial documents
              </p>

            </label>
          ) : (
            <div className="space-y-3">
              {/* Selected file info */}
              <div className="p-3 bg-slate-50 rounded-lg flex items-start gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-slate-600 uppercase">
                    {file.name.split('.').pop()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 text-center">
                    {uploadProgress >= 100 ? 'Finalizing registration...' : `${uploadProgress}% uploaded`}
                  </p>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-200">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload Protocol
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UploadDialog;
