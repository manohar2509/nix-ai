import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, Loader2, Upload, RefreshCw, FileText, Trash2, CheckCircle, Database, FolderOpen, X, Shield, Info } from 'lucide-react';
import { useAppStore, useAuth, useUI, useKB } from '../stores/useAppStore';
import kbService from '../services/kbService';
import jobService from '../services/jobService';
import { cn } from '../utils/cn';

/**
 * Knowledge Base Management Panel (Admin Only)
 *
 * CRITICAL ARCHITECTURE:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   KB docs   → nixai-clinical-kb bucket    → Bedrock RAG (shared with ALL users)
 *   User docs → nixai-clinical-uploads bucket → PRIVATE (per-user, never in RAG)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Admins upload curated reference materials (regulatory guidelines, templates, etc.)
 * that become searchable by all users via RAG chat.
 *
 * User trial documents are NEVER uploaded here or indexed into the KB.
 */

const CATEGORIES = [
  { value: 'regulatory', label: 'Regulatory', color: 'bg-red-100 text-red-700' },
  { value: 'guideline', label: 'Guideline', color: 'bg-blue-100 text-blue-700' },
  { value: 'template', label: 'Template', color: 'bg-purple-100 text-purple-700' },
  { value: 'reference', label: 'Reference', color: 'bg-green-100 text-green-700' },
  { value: 'general', label: 'General', color: 'bg-slate-100 text-slate-700' },
];

const getCategoryStyle = (cat) =>
  CATEGORIES.find((c) => c.value === cat)?.color || 'bg-slate-100 text-slate-700';

export function SyntheticFactoryPanel() {
  const { user, isAdmin } = useAuth();
  const { kbDocuments, isKbLoading } = useKB();
  const showToast = useAppStore((state) => state.showToast);
  const setKbDocuments = useAppStore((state) => state.setKbDocuments);
  const addKbDocument = useAppStore((state) => state.addKbDocument);
  const removeKbDocument = useAppStore((state) => state.removeKbDocument);
  const setIsKbLoading = useAppStore((state) => state.setIsKbLoading);

  // Upload state
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('general');
  const fileInputRef = useRef(null);

  // KB sync state
  const { isKbSyncing } = useUI();
  const setIsKbSyncing = useAppStore((state) => state.setIsKbSyncing);
  const [syncStatus, setSyncStatus] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const syncInFlightRef = useRef(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState(null);

  // Load KB documents on mount (separate from user documents)
  useEffect(() => {
    if (isAdmin) loadKbDocuments();
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Non-admin guard (AFTER all hooks)
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Shield size={32} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-600 font-medium">Admin access required</p>
          <p className="text-xs text-slate-400 mt-1">Only admins can manage the Knowledge Base</p>
        </div>
      </div>
    );
  }

  const loadKbDocuments = async () => {
    setIsKbLoading(true);
    try {
      const data = await kbService.listDocuments();
      setKbDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to load KB documents:', err);
    } finally {
      setIsKbLoading(false);
    }
  };

  const ACCEPTED_EXTENSIONS = '.pdf,.json,.txt,.csv,.docx,.doc,.xlsx,.xls,.html,.md';

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const valid = [];
    for (const file of selected) {
      if (file.size > 50 * 1024 * 1024) {
        showToast({ type: 'error', title: 'File too large', message: `${file.name} exceeds 50MB limit` });
        continue;
      }
      valid.push(file);
    }

    setFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    const valid = dropped.filter((f) => f.size <= 50 * 1024 * 1024);
    setFiles((prev) => [...prev, ...valid]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  /**
   * Upload all selected files to the KB bucket (NOT the user uploads bucket).
   *
   * Flow: kbService.getUploadUrl() → PUT to KB presigned URL → kbService.registerDocument()
   *
   * This creates KB_DOCUMENT entities in DynamoDB, completely separate
   * from user DOCUMENT entities.
   */
  const handleUploadAll = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const results = { success: 0, failed: 0 };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = `${file.name}-${i}`;

      try {
        setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'uploading', percent: 0 } }));

        // 1. Get presigned URL for KB bucket (admin-only endpoint)
        const { url, key } = await kbService.getUploadUrl(file.name, file.type || 'application/pdf');

        // 2. Upload directly to KB S3 bucket
        await kbService.uploadToKBBucket(file, url, (percent) => {
          setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'uploading', percent } }));
        });

        // 3. Register as KB_DOCUMENT (separate from user documents)
        const doc = await kbService.registerDocument(
          file.name,
          key,
          file.size,
          '', // description
          selectedCategory,
        );
        addKbDocument(doc);

        setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'complete', percent: 100 } }));
        results.success++;
      } catch (err) {
        console.error(`KB upload failed for ${file.name}:`, err);
        setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'failed', percent: 0, error: err.message } }));
        results.failed++;
      }
    }

    setIsUploading(false);

    if (results.success > 0) {
      showToast({
        type: 'success',
        title: 'KB Upload complete',
        message: `${results.success} reference document(s) added to Knowledge Base${results.failed > 0 ? `, ${results.failed} failed` : ''}. Remember to Sync.`,
      });
    }

    if (results.failed > 0 && results.success === 0) {
      showToast({ type: 'error', title: 'Upload failed', message: 'All uploads failed. Check file formats and try again.' });
    }

    setTimeout(() => {
      setFiles([]);
      setUploadProgress({});
    }, 2000);
  };

  const handleDeleteKbDoc = async (kbDocId) => {
    try {
      await kbService.deleteDocument(kbDocId);
      removeKbDocument(kbDocId);
      showToast({ type: 'success', title: 'Deleted', message: 'KB document removed. Sync to update Bedrock index.' });
    } catch (err) {
      showToast({ type: 'error', title: 'Delete failed', message: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  const handleKbSync = useCallback(async () => {
    if (syncInFlightRef.current || isKbSyncing) return;
    syncInFlightRef.current = true;
    setIsKbSyncing(true);
    setSyncStatus('syncing');
    try {
      const response = await kbService.syncKnowledgeBase();

      if (response.deduplicated) {
        showToast({ type: 'info', title: 'KB Sync already running', message: `Job ${response.jobId} is already in progress` });
        setSyncStatus(null);
        return;
      }

      if (response.inline) {
        if (response.status === 'COMPLETE') {
          setSyncStatus('complete');
          setLastSyncTime(new Date().toLocaleString());
          showToast({ type: 'success', title: 'KB Sync complete', message: 'Knowledge Base re-indexed successfully' });
        } else if (response.status === 'FAILED') {
          setSyncStatus('failed');
          showToast({ type: 'error', title: 'KB Sync failed', message: response.error || 'Check backend logs' });
        }
        return;
      }

      showToast({ type: 'success', title: 'KB Sync started', message: `Job ${response.jobId} queued` });
      const delays = [2000, 3000, 5000, 5000, 8000, 8000, 10000, 10000];
      let status = response.status || 'QUEUED';
      for (const delay of delays) {
        await new Promise((r) => setTimeout(r, delay));
        const result = await jobService.getJobStatus(response.jobId);
        status = result.status;
        if (status !== 'QUEUED' && status !== 'IN_PROGRESS') break;
      }

      if (status === 'COMPLETE') {
        setSyncStatus('complete');
        setLastSyncTime(new Date().toLocaleString());
        showToast({ type: 'success', title: 'KB Sync complete', message: 'Knowledge Base updated and re-indexed' });
      } else if (status === 'FAILED') {
        setSyncStatus('failed');
        showToast({ type: 'error', title: 'KB Sync failed', message: 'Check logs for details' });
      } else {
        setSyncStatus(null);
        showToast({ type: 'info', title: 'KB Sync still processing', message: 'Running in the background.' });
      }
    } catch (err) {
      setSyncStatus('failed');
      showToast({ type: 'error', title: 'KB Sync failed', message: err.message });
    } finally {
      setIsKbSyncing(false);
      syncInFlightRef.current = false;
    }
  }, [isKbSyncing, setIsKbSyncing, showToast]);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const getFileIcon = (name) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const colors = {
      pdf: 'bg-red-100 text-red-600',
      json: 'bg-amber-100 text-amber-600',
      txt: 'bg-slate-100 text-slate-600',
      csv: 'bg-green-100 text-green-600',
      docx: 'bg-blue-100 text-blue-600',
      doc: 'bg-blue-100 text-blue-600',
      xlsx: 'bg-emerald-100 text-emerald-600',
      xls: 'bg-emerald-100 text-emerald-600',
      html: 'bg-orange-100 text-orange-600',
      md: 'bg-violet-100 text-violet-600',
    };
    return colors[ext] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-[0.1em]">
            Knowledge Base
          </h3>
          <div className="flex items-center gap-2">
            <Database size={14} className="text-purple-600" />
            <span className="text-[10px] text-slate-500 font-medium">
              {kbDocuments.length} reference doc{kbDocuments.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Architecture info banner */}
        <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
          <Info size={14} className="text-purple-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-purple-700 leading-relaxed">
            <strong>Admin-only curated reference materials.</strong> Documents uploaded here
            are indexed by Bedrock and become searchable by <em>all users</em> via RAG chat.
            User trial documents are private and never enter the Knowledge Base.
          </p>
        </div>

        {/* Category selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.1em]">
            Category for new uploads
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all border',
                  selectedCategory === cat.value
                    ? `${cat.color} border-current ring-1 ring-current/20`
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload size={28} className="mx-auto text-slate-400 group-hover:text-purple-500 transition-colors mb-2" />
          <p className="text-sm font-medium text-slate-700">
            Drop reference documents or click to browse
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            PDF, JSON, TXT, CSV, DOCX, XLSX, HTML, MD — up to 50MB each
          </p>
        </div>

        {/* Selected files list */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                {files.length} file{files.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => { setFiles([]); setUploadProgress({}); }}
                className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {files.map((file, idx) => {
                const fileId = `${file.name}-${idx}`;
                const progress = uploadProgress[fileId];

                return (
                  <div key={fileId} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                    <div className={cn('w-8 h-8 rounded flex items-center justify-center shrink-0', getFileIcon(file.name))}>
                      <span className="text-[9px] font-bold uppercase">
                        {file.name.split('.').pop()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500">{formatFileSize(file.size)}</p>
                    </div>

                    {progress?.status === 'uploading' && (
                      <div className="flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin text-purple-600" />
                        <span className="text-[10px] text-purple-600">{progress.percent}%</span>
                      </div>
                    )}
                    {progress?.status === 'complete' && (
                      <CheckCircle size={14} className="text-green-500" />
                    )}
                    {progress?.status === 'failed' && (
                      <AlertCircle size={14} className="text-red-500" />
                    )}
                    {!progress && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile(idx); }}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                      >
                        <X size={12} className="text-slate-400" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleUploadAll}
              disabled={isUploading || files.length === 0}
              className="w-full px-4 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading to KB...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Upload {files.length} to Knowledge Base
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* KB Sync + Document List Section */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* KB Sync Card */}
        <div className="p-4 bg-gradient-to-br from-purple-50 to-slate-50 rounded-xl border border-purple-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-[0.1em]">
                Bedrock Sync
              </h4>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Re-index KB documents so uploads/deletions take effect in RAG
              </p>
            </div>
            {syncStatus === 'complete' && (
              <CheckCircle size={16} className="text-green-500 shrink-0" />
            )}
          </div>

          {lastSyncTime && (
            <p className="text-[10px] text-slate-400">
              Last synced: {lastSyncTime}
            </p>
          )}

          <button
            onClick={handleKbSync}
            disabled={isKbSyncing}
            className={cn(
              'w-full px-4 py-2.5 font-semibold rounded-lg transition-all flex items-center justify-center gap-2',
              isKbSyncing
                ? 'bg-purple-100 text-purple-600 cursor-wait'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            )}
          >
            <RefreshCw size={16} className={cn(isKbSyncing && 'animate-spin')} />
            {isKbSyncing ? 'Syncing Knowledge Base...' : 'Sync Knowledge Base'}
          </button>
        </div>

        {/* KB Documents (separate from user documents) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-[0.1em]">
              KB Reference Documents ({kbDocuments.length})
            </h4>
            {kbDocuments.length > 0 && (
              <button
                onClick={loadKbDocuments}
                className="text-[10px] text-slate-400 hover:text-purple-500 transition-colors"
              >
                Refresh
              </button>
            )}
          </div>

          {isKbLoading ? (
            <div className="text-center py-8">
              <Loader2 size={24} className="mx-auto text-purple-400 animate-spin mb-2" />
              <p className="text-xs text-slate-500">Loading KB documents...</p>
            </div>
          ) : kbDocuments.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-600">No KB documents yet</p>
              <p className="text-xs text-slate-500">Upload reference materials above to build the Knowledge Base</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {kbDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100 hover:border-purple-200 hover:shadow-sm transition-all group"
                >
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', getFileIcon(doc.name))}>
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate group-hover:text-purple-700 transition-colors">
                      {doc.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400">
                        {doc.size ? formatFileSize(doc.size) : '—'}
                      </span>
                      <span className="text-[10px] text-slate-300">•</span>
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                        getCategoryStyle(doc.category)
                      )}>
                        {doc.category || 'general'}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  {deletingId === doc.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDeleteKbDoc(doc.id)}
                        className="text-[10px] text-red-600 font-semibold hover:underline"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-[10px] text-slate-400 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(doc.id)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                      title="Delete KB document"
                    >
                      <Trash2 size={13} className="text-slate-400 hover:text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help text */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <strong className="text-slate-600">How it works:</strong>{' '}
            Upload curated reference documents (FDA guidelines, regulatory templates, standard protocols)
            → Documents are stored in the <strong>KB S3 bucket</strong> (separate from user uploads)
            → Click <strong>Sync Knowledge Base</strong> to trigger Bedrock re-indexing
            → Content becomes searchable by <em>all users</em> in the Consultant Chat via RAG.
          </p>
          <p className="text-[10px] text-red-500/80 leading-relaxed mt-2">
            <strong>⚠ Important:</strong> User trial documents are private and are NEVER added to the
            Knowledge Base. Only admin-curated reference materials should be uploaded here.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SyntheticFactoryPanel;
