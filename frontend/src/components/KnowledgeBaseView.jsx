import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Database, Upload, RefreshCw, FileText, Trash2, CheckCircle, XCircle,
  AlertTriangle, Search, Filter, Loader2, FolderOpen, X, Shield, Info,
  ArrowLeft, ShieldAlert, Clock, HardDrive, BarChart3, AlertCircle,
  Download, Eye, EyeOff, Zap, Heart, ChevronDown, ChevronRight, Copy,
  Check, RotateCcw, Sparkles,
} from 'lucide-react';
import { useAppStore, useAuth, useUI, useKB } from '../stores/useAppStore';
import kbService from '../services/kbService';
import jobService from '../services/jobService';
import { cn } from '../utils/cn';

/* ── Constants ── */
const CATEGORIES = [
  { value: 'regulatory', label: 'Regulatory', color: 'bg-red-100 text-red-700', borderColor: 'border-red-200' },
  { value: 'guideline', label: 'Guideline', color: 'bg-blue-100 text-blue-700', borderColor: 'border-blue-200' },
  { value: 'template', label: 'Template', color: 'bg-purple-100 text-purple-700', borderColor: 'border-purple-200' },
  { value: 'reference', label: 'Reference', color: 'bg-green-100 text-green-700', borderColor: 'border-green-200' },
  { value: 'general', label: 'General', color: 'bg-slate-100 text-slate-700', borderColor: 'border-slate-200' },
];

const getCategoryStyle = (cat) =>
  CATEGORIES.find((c) => c.value === cat) || CATEGORIES[4];

const ACCEPTED_EXTENSIONS = '.pdf,.json,.txt,.csv,.docx,.doc,.xlsx,.xls,.html,.md';

export default function KnowledgeBaseView() {
  const { user, isAdmin } = useAuth();
  const { kbDocuments, isKbLoading } = useKB();
  const { isKbSyncing } = useUI();
  const showToast = useAppStore((s) => s.showToast);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setKbDocuments = useAppStore((s) => s.setKbDocuments);
  const addKbDocument = useAppStore((s) => s.addKbDocument);
  const removeKbDocument = useAppStore((s) => s.removeKbDocument);
  const setIsKbLoading = useAppStore((s) => s.setIsKbLoading);
  const setIsKbSyncing = useAppStore((s) => s.setIsKbSyncing);

  // Local state
  const [activeSection, setActiveSection] = useState('documents'); // documents | upload | sanity | stats
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [sanityResults, setSanityResults] = useState(null);
  const [sanityLoading, setSanityLoading] = useState(false);
  const [kbStats, setKbStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Upload state
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('general');
  const [description, setDescription] = useState('');
  const [duplicateWarnings, setDuplicateWarnings] = useState({});
  const fileInputRef = useRef(null);

  // Sync state
  const syncInFlightRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState(null);

  // Delete
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Load on mount
  useEffect(() => {
    if (isAdmin) {
      loadKbDocuments();
      loadStats();
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAdmin) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-lg font-bold text-slate-700 mb-2">Admin Access Required</h2>
          <p className="text-sm text-slate-400">Only administrators can manage the Knowledge Base.</p>
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
      showToast({ type: 'error', title: 'Failed to load KB', message: err.message });
    } finally {
      setIsKbLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await kbService.getStats();
      setKbStats(data);
    } catch (err) {
      console.error('Failed to load KB stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const runSanityCheck = async () => {
    setSanityLoading(true);
    try {
      const data = await kbService.runSanityCheck();
      setSanityResults(data);
      setActiveSection('sanity');
    } catch (err) {
      showToast({ type: 'error', title: 'Sanity check failed', message: err.message });
    } finally {
      setSanityLoading(false);
    }
  };

  /* ── File Upload Logic ── */
  const handleFileSelect = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const valid = [];
    const warnings = {};
    for (const file of selected) {
      if (file.size > 50 * 1024 * 1024) {
        showToast({ type: 'error', title: 'File too large', message: `${file.name} exceeds 50MB limit` });
        continue;
      }
      // Check for duplicates
      try {
        const dupCheck = await kbService.checkDuplicate(file.name);
        if (dupCheck.is_duplicate) {
          warnings[file.name] = dupCheck.message;
        }
      } catch {
        // Non-blocking
      }
      valid.push(file);
    }

    setFiles((prev) => [...prev, ...valid]);
    setDuplicateWarnings((prev) => ({ ...prev, ...warnings }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []);
    const valid = dropped.filter((f) => f.size <= 50 * 1024 * 1024);
    setFiles((prev) => [...prev, ...valid]);
  };

  const handleUploadAll = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    const results = { success: 0, failed: 0 };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = `${file.name}-${i}`;
      try {
        setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'uploading', percent: 0 } }));
        const { url, key } = await kbService.getUploadUrl(file.name, file.type || 'application/pdf');
        await kbService.uploadToKBBucket(file, url, (percent) => {
          setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'uploading', percent } }));
        });
        const doc = await kbService.registerDocument(file.name, key, file.size, description, selectedCategory);
        addKbDocument(doc);
        setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'complete', percent: 100 } }));
        results.success++;
      } catch (err) {
        setUploadProgress((prev) => ({ ...prev, [fileId]: { status: 'failed', percent: 0, error: err.message } }));
        results.failed++;
      }
    }

    setIsUploading(false);
    if (results.success > 0) {
      showToast({
        type: 'success',
        title: 'KB Upload complete',
        message: `${results.success} document(s) added. Remember to Sync to update Bedrock index.`,
      });
      loadStats();
    }
    setTimeout(() => { setFiles([]); setUploadProgress({}); setDuplicateWarnings({}); setDescription(''); }, 2000);
  };

  /* ── Document Actions ── */
  const handleDelete = async (kbDocId) => {
    try {
      await kbService.deleteDocument(kbDocId);
      removeKbDocument(kbDocId);
      setSelectedDocs((prev) => { const n = new Set(prev); n.delete(kbDocId); return n; });
      showToast({ type: 'success', title: 'Deleted', message: 'Document removed. Sync to update Bedrock index.' });
      loadStats();
    } catch (err) {
      showToast({ type: 'error', title: 'Delete failed', message: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDocs.size === 0) return;
    setBulkDeleting(true);
    try {
      const result = await kbService.bulkDelete(Array.from(selectedDocs));
      result.deleted?.forEach((id) => removeKbDocument(id));
      setSelectedDocs(new Set());
      showToast({
        type: 'success',
        title: 'Bulk delete complete',
        message: `${result.deleted_count} deleted${result.failed_count > 0 ? `, ${result.failed_count} failed` : ''}. Sync to update.`,
      });
      loadStats();
    } catch (err) {
      showToast({ type: 'error', title: 'Bulk delete failed', message: err.message });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleUnsync = async (kbDocId) => {
    try {
      await kbService.unsyncDocument(kbDocId);
      const updatedDocs = kbDocuments.map((d) => d.id === kbDocId ? { ...d, status: 'unsynced' } : d);
      setKbDocuments(updatedDocs);
      showToast({ type: 'info', title: 'Unsynced', message: 'Document will be excluded from next Bedrock sync.' });
    } catch (err) {
      showToast({ type: 'error', title: 'Unsync failed', message: err.message });
    }
  };

  const handleResync = async (kbDocId) => {
    try {
      await kbService.resyncDocument(kbDocId);
      const updatedDocs = kbDocuments.map((d) => d.id === kbDocId ? { ...d, status: 'uploaded' } : d);
      setKbDocuments(updatedDocs);
      showToast({ type: 'success', title: 'Re-synced', message: 'Document will be included in next Bedrock sync.' });
    } catch (err) {
      showToast({ type: 'error', title: 'Resync failed', message: err.message });
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
        showToast({ type: 'info', title: 'Sync already running', message: `Job ${response.jobId} in progress` });
        setSyncStatus(null); return;
      }
      if (response.inline) {
        setSyncStatus(response.status === 'COMPLETE' ? 'complete' : 'failed');
        showToast({ type: response.status === 'COMPLETE' ? 'success' : 'error', title: `KB Sync ${response.status === 'COMPLETE' ? 'complete' : 'failed'}`, message: response.error || 'Bedrock re-indexed.' });
        loadKbDocuments(); loadStats(); return;
      }
      showToast({ type: 'success', title: 'Sync started', message: `Job ${response.jobId} queued` });
      const delays = [2000, 3000, 5000, 5000, 8000, 8000, 10000, 10000];
      let status = response.status || 'QUEUED';
      for (const delay of delays) {
        await new Promise((r) => setTimeout(r, delay));
        const result = await jobService.getJobStatus(response.jobId);
        status = result.status;
        if (status !== 'QUEUED' && status !== 'IN_PROGRESS') break;
      }
      setSyncStatus(status === 'COMPLETE' ? 'complete' : status === 'FAILED' ? 'failed' : null);
      showToast({ type: status === 'COMPLETE' ? 'success' : status === 'FAILED' ? 'error' : 'info', title: `KB Sync ${status === 'COMPLETE' ? 'complete' : status === 'FAILED' ? 'failed' : 'processing'}`, message: status === 'COMPLETE' ? 'Knowledge Base updated.' : 'Check Job Monitor.' });
      loadKbDocuments(); loadStats();
    } catch (err) {
      setSyncStatus('failed');
      showToast({ type: 'error', title: 'Sync failed', message: err.message });
    } finally {
      setIsKbSyncing(false);
      syncInFlightRef.current = false;
    }
  }, [isKbSyncing, setIsKbSyncing, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Filtering ── */
  const filtered = kbDocuments
    .filter((d) => {
      if (searchQuery && !d.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterCategory !== 'all' && d.category !== filterCategory) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'synced' && d.status === 'unsynced') return false;
        if (filterStatus === 'unsynced' && d.status !== 'unsynced') return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return (b.created_at || '').localeCompare(a.created_at || '');
      if (sortBy === 'oldest') return (a.created_at || '').localeCompare(b.created_at || '');
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'size') return (b.size || 0) - (a.size || 0);
      return 0;
    });

  const toggleSelectAll = () => {
    if (selectedDocs.size === filtered.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(filtered.map((d) => d.id)));
    }
  };

  const toggleSelect = (id) => {
    setSelectedDocs((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const syncedCount = kbDocuments.filter((d) => d.status !== 'unsynced').length;
  const unsyncedCount = kbDocuments.filter((d) => d.status === 'unsynced').length;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-purple-50/20">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Knowledge Base</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Manage reference documents for Bedrock RAG &middot; {kbDocuments.length} documents &middot; {syncedCount} synced
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-purple-100 text-purple-700">Admin Only</span>
            <button onClick={loadKbDocuments} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          <KBMetricCard label="Total Documents" value={kbDocuments.length} icon={<FileText size={18} />} color="purple" />
          <KBMetricCard label="Synced" value={syncedCount} icon={<CheckCircle size={18} />} color="green" />
          <KBMetricCard label="Unsynced" value={unsyncedCount} icon={<EyeOff size={18} />} color={unsyncedCount > 0 ? 'amber' : 'slate'} />
          <KBMetricCard label="Total Size" value={formatBytes(kbDocuments.reduce((s, d) => s + (d.size || 0), 0))} icon={<HardDrive size={18} />} color="indigo" isText />
          <KBMetricCard label="Categories" value={new Set(kbDocuments.map((d) => d.category || 'general')).size} icon={<Filter size={18} />} color="brand" />
          <KBMetricCard label="Health" value={sanityResults ? `${Math.round(sanityResults.health_score)}%` : '—'} icon={<Heart size={18} />} color={sanityResults?.health_score >= 80 ? 'green' : sanityResults?.health_score >= 50 ? 'amber' : 'red'} isText />
        </div>

        {/* ── Action Bar ── */}
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Section Tabs */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              {[
                { id: 'documents', label: 'Documents', icon: <FileText size={14} /> },
                { id: 'upload', label: 'Upload', icon: <Upload size={14} /> },
                { id: 'sanity', label: 'Health Check', icon: <ShieldAlert size={14} /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all',
                    activeSection === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Sync Button */}
            <button
              onClick={handleKbSync}
              disabled={isKbSyncing}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                isKbSyncing
                  ? 'bg-purple-100 text-purple-600 cursor-wait'
                  : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
              )}
            >
              <RefreshCw size={14} className={cn(isKbSyncing && 'animate-spin')} />
              {isKbSyncing ? 'Syncing...' : 'Sync Knowledge Base'}
            </button>

            {/* Sanity Check Button */}
            <button
              onClick={runSanityCheck}
              disabled={sanityLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-all"
            >
              {sanityLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              Run Health Check
            </button>
          </div>
        </div>

        {/* ── Content Sections ── */}
        {activeSection === 'documents' && (
          <DocumentsSection
            documents={filtered}
            allDocuments={kbDocuments}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterCategory={filterCategory}
            setFilterCategory={setFilterCategory}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            sortBy={sortBy}
            setSortBy={setSortBy}
            selectedDocs={selectedDocs}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            deletingId={deletingId}
            setDeletingId={setDeletingId}
            handleDelete={handleDelete}
            handleBulkDelete={handleBulkDelete}
            bulkDeleting={bulkDeleting}
            handleUnsync={handleUnsync}
            handleResync={handleResync}
            isLoading={isKbLoading}
            setActiveSection={setActiveSection}
          />
        )}

        {activeSection === 'upload' && (
          <UploadSection
            files={files}
            setFiles={setFiles}
            fileInputRef={fileInputRef}
            handleFileSelect={handleFileSelect}
            handleDrop={handleDrop}
            handleUploadAll={handleUploadAll}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            setUploadProgress={setUploadProgress}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            description={description}
            setDescription={setDescription}
            duplicateWarnings={duplicateWarnings}
          />
        )}

        {activeSection === 'sanity' && (
          <SanitySection
            results={sanityResults}
            loading={sanityLoading}
            onRunCheck={runSanityCheck}
          />
        )}

        {/* ── Help Info ── */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-600 to-indigo-600 rounded-2xl p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
              <Info size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-sm mb-2">How Knowledge Base Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-purple-100 text-xs leading-relaxed">
                <div>
                  <span className="font-bold text-white">1. Upload</span> — Add curated reference docs (FDA guidelines, regulatory templates, protocols). These go to the dedicated KB S3 bucket.
                </div>
                <div>
                  <span className="font-bold text-white">2. Sync</span> — Trigger Bedrock re-indexing. Synced docs become searchable. Unsynced docs are excluded from the vector store.
                </div>
                <div>
                  <span className="font-bold text-white">3. RAG Chat</span> — All users can query these documents via the Consultant Chat. User trial documents remain private and are never in KB.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   DOCUMENTS SECTION
   ════════════════════════════════════════════════════════════════ */
function DocumentsSection({
  documents, allDocuments, searchQuery, setSearchQuery, filterCategory, setFilterCategory,
  filterStatus, setFilterStatus, sortBy, setSortBy, selectedDocs, toggleSelect, toggleSelectAll,
  deletingId, setDeletingId, handleDelete, handleBulkDelete, bulkDeleting,
  handleUnsync, handleResync, isLoading, setActiveSection,
}) {
  return (
    <div className="space-y-4">
      {/* Search + Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
            />
          </div>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            {['all', 'synced', 'unsynced'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  filterStatus === s
                    ? s === 'synced' ? 'bg-green-100 text-green-700' : s === 'unsynced' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                )}
              >
                {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-600"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Name</option>
            <option value="size">Sort: Largest</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedDocs.size > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-purple-700">
            {selectedDocs.size} document{selectedDocs.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDocs(new Set())}
              className="text-xs text-purple-500 hover:text-purple-700"
            >
              Clear
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {bulkDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Document List */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center">
          <Loader2 size={32} className="mx-auto text-purple-400 animate-spin mb-3" />
          <p className="text-sm text-slate-500">Loading Knowledge Base...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-16 text-center">
          <FolderOpen size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            {allDocuments.length > 0 ? 'No matching documents' : 'Knowledge Base is empty'}
          </h3>
          <p className="text-sm text-slate-400 max-w-[360px] mx-auto mb-6">
            {allDocuments.length > 0
              ? 'Try adjusting your search or filters'
              : 'Upload reference documents to build your Knowledge Base for RAG-powered chat'}
          </p>
          {allDocuments.length === 0 && (
            <button
              onClick={() => setActiveSection('upload')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors"
            >
              <Upload size={16} /> Upload Documents
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <input
              type="checkbox"
              checked={selectedDocs.size === documents.length && documents.length > 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="flex-1">Document</span>
            <span className="w-20 text-center">Category</span>
            <span className="w-16 text-center">Size</span>
            <span className="w-20 text-center">Status</span>
            <span className="w-28 text-center">Uploaded</span>
            <span className="w-28 text-right">Actions</span>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <KBDocumentRow
                key={doc.id}
                doc={doc}
                isSelected={selectedDocs.has(doc.id)}
                onToggle={() => toggleSelect(doc.id)}
                isDeleting={deletingId === doc.id}
                onDeleteClick={() => setDeletingId(doc.id)}
                onDeleteConfirm={() => handleDelete(doc.id)}
                onDeleteCancel={() => setDeletingId(null)}
                onUnsync={() => handleUnsync(doc.id)}
                onResync={() => handleResync(doc.id)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Showing {documents.length} of {allDocuments.length} documents
            </span>
          </div>
        </div>
      )}
    </div>
  );
}


function KBDocumentRow({ doc, isSelected, onToggle, isDeleting, onDeleteClick, onDeleteConfirm, onDeleteCancel, onUnsync, onResync }) {
  const catStyle = getCategoryStyle(doc.category);
  const isUnsynced = doc.status === 'unsynced';
  const isError = doc.status === 'error';

  return (
    <div className={cn(
      'flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors group',
      isSelected && 'bg-purple-50/40',
      isUnsynced && 'opacity-70',
    )}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
      />

      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', getFileIcon(doc.name))}>
          <FileText size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
          <p className="text-[10px] text-slate-400 truncate">
            {doc.uploaded_by ? `by ${doc.uploaded_by.substring(0, 12)}...` : ''}
            {doc.description ? ` — ${doc.description}` : ''}
          </p>
        </div>
      </div>

      <div className="w-20 text-center">
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', catStyle.color)}>
          {doc.category || 'general'}
        </span>
      </div>

      <div className="w-16 text-center text-xs text-slate-500">{formatBytes(doc.size)}</div>

      <div className="w-20 text-center">
        <span className={cn(
          'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
          isUnsynced ? 'bg-amber-100 text-amber-700' :
          isError ? 'bg-red-100 text-red-700' :
          doc.status === 'indexed' ? 'bg-green-100 text-green-700' :
          'bg-blue-100 text-blue-700'
        )}>
          {isUnsynced ? <EyeOff size={9} /> : isError ? <XCircle size={9} /> : <CheckCircle size={9} />}
          {doc.status || 'uploaded'}
        </span>
      </div>

      <div className="w-28 text-center text-[11px] text-slate-400">
        {doc.created_at ? formatDate(doc.created_at) : '—'}
      </div>

      <div className="w-28 flex items-center justify-end gap-1">
        {isDeleting ? (
          <div className="flex items-center gap-1">
            <button onClick={onDeleteConfirm} className="text-[10px] font-semibold text-red-600 hover:underline">Delete</button>
            <button onClick={onDeleteCancel} className="text-[10px] text-slate-400 hover:underline">Cancel</button>
          </div>
        ) : (
          <>
            {isUnsynced ? (
              <button onClick={onResync} className="p-1.5 rounded-lg hover:bg-green-50 opacity-0 group-hover:opacity-100 transition-all" title="Re-sync document">
                <RotateCcw size={13} className="text-green-500" />
              </button>
            ) : (
              <button onClick={onUnsync} className="p-1.5 rounded-lg hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-all" title="Unsync document">
                <EyeOff size={13} className="text-amber-500" />
              </button>
            )}
            <button onClick={onDeleteClick} className="p-1.5 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all" title="Delete document">
              <Trash2 size={13} className="text-slate-400 hover:text-red-500" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   UPLOAD SECTION
   ════════════════════════════════════════════════════════════════ */
function UploadSection({
  files, setFiles, fileInputRef, handleFileSelect, handleDrop, handleUploadAll,
  isUploading, uploadProgress, setUploadProgress,
  selectedCategory, setSelectedCategory, description, setDescription, duplicateWarnings,
}) {
  const hasFiles = files.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Upload Card */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-5">
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-1">Upload Reference Documents</h3>
          <p className="text-xs text-slate-400">Add curated materials to the Knowledge Base. These will be indexed by Bedrock for RAG chat.</p>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
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

        {/* Description */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description (optional)</label>
          <input
            type="text"
            placeholder="Brief description for these uploads..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all group"
        >
          <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} multiple onChange={handleFileSelect} className="hidden" />
          <Upload size={36} className="mx-auto text-slate-300 group-hover:text-purple-500 transition-colors mb-3" />
          <p className="text-sm font-medium text-slate-700">Drop reference documents or click to browse</p>
          <p className="text-[11px] text-slate-400 mt-1">PDF, JSON, TXT, CSV, DOCX, XLSX, HTML, MD — up to 50MB each</p>
        </div>

        {/* Selected Files */}
        {hasFiles && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">{files.length} file{files.length > 1 ? 's' : ''} selected</span>
              <button onClick={() => { setFiles([]); setUploadProgress({}); }} className="text-[10px] text-slate-400 hover:text-red-500">Clear all</button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {files.map((file, idx) => {
                const fileId = `${file.name}-${idx}`;
                const progress = uploadProgress[fileId];
                const isDuplicate = duplicateWarnings[file.name];
                return (
                  <div key={fileId} className={cn('flex items-center gap-3 p-3 rounded-xl border', isDuplicate ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100')}>
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', getFileIcon(file.name))}>
                      <span className="text-[9px] font-bold uppercase">{file.name.split('.').pop()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500">{formatBytes(file.size)}</p>
                      {isDuplicate && (
                        <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1 mt-0.5">
                          <AlertTriangle size={10} /> Duplicate — this file already exists in KB
                        </p>
                      )}
                    </div>
                    {progress?.status === 'uploading' && <ProgressPill percent={progress.percent} />}
                    {progress?.status === 'complete' && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                    {progress?.status === 'failed' && <XCircle size={16} className="text-red-500 shrink-0" />}
                    {!progress && (
                      <button onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))} className="p-1 hover:bg-slate-200 rounded transition-colors shrink-0">
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
              className="w-full px-4 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUploading ? <><Loader2 size={16} className="animate-spin" /> Uploading to KB...</> : <><Upload size={16} /> Upload {files.length} to Knowledge Base</>}
            </button>
          </div>
        )}
      </div>

      {/* Upload Guidelines Card */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-5 h-fit">
        <h3 className="text-sm font-bold text-slate-800">Upload Guidelines</h3>
        <div className="space-y-4">
          <GuidelineItem icon={<CheckCircle size={14} className="text-green-500" />} title="Supported formats" text="PDF, JSON, TXT, CSV, DOCX, XLSX, HTML, Markdown" />
          <GuidelineItem icon={<HardDrive size={14} className="text-blue-500" />} title="Max file size" text="50MB per file. Larger files may slow indexing." />
          <GuidelineItem icon={<AlertTriangle size={14} className="text-amber-500" />} title="Duplicates" text="System will warn if a filename already exists in the KB." />
          <GuidelineItem icon={<Shield size={14} className="text-purple-500" />} title="Privacy" text="KB documents are shared via RAG with all users. Never upload private trial data here." />
          <GuidelineItem icon={<RefreshCw size={14} className="text-indigo-500" />} title="After upload" text="Remember to run Sync so Bedrock indexes the new documents." />
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   SANITY CHECK SECTION
   ════════════════════════════════════════════════════════════════ */
function SanitySection({ results, loading, onRunCheck }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center">
        <Loader2 size={32} className="mx-auto text-amber-400 animate-spin mb-3" />
        <p className="text-sm text-slate-500">Running health checks...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-16 text-center">
        <ShieldAlert size={48} className="mx-auto text-slate-300 mb-4" />
        <h3 className="text-lg font-semibold text-slate-700 mb-2">Health Check</h3>
        <p className="text-sm text-slate-400 max-w-[360px] mx-auto mb-6">
          Run a comprehensive sanity check to detect duplicates, missing files, unsupported formats, and sync issues.
        </p>
        <button onClick={onRunCheck} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-500 rounded-xl hover:bg-amber-600">
          <ShieldAlert size={16} /> Run Health Check
        </button>
      </div>
    );
  }

  const scoreColor = results.health_score >= 80 ? 'green' : results.health_score >= 50 ? 'amber' : 'red';

  return (
    <div className="space-y-6">
      {/* Health Score Card */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Knowledge Base Health Score</h3>
            <p className="text-xs text-slate-400 mt-0.5">{results.total_documents} documents analyzed</p>
          </div>
          <div className={cn(
            'h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold',
            scoreColor === 'green' ? 'bg-green-50 text-green-600' :
            scoreColor === 'amber' ? 'bg-amber-50 text-amber-600' :
            'bg-red-50 text-red-600'
          )}>
            {Math.round(results.health_score)}%
          </div>
        </div>

        {/* Health bar */}
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div
            className={cn('h-full rounded-full transition-all duration-1000', scoreColor === 'green' ? 'bg-green-500' : scoreColor === 'amber' ? 'bg-amber-500' : 'bg-red-500')}
            style={{ width: `${results.health_score}%` }}
          />
        </div>

        {/* Recommendations */}
        {results.recommendations?.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recommendations</h4>
            {results.recommendations.map((rec, idx) => (
              <div key={idx} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <Sparkles size={12} className="text-purple-500 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-600">{rec}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Issues Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <IssueCard title="Duplicates" count={results.duplicates?.length || 0} items={results.duplicates?.map((d) => `${d.filename} (${d.count} copies)`) || []} icon={<Copy size={16} />} color="amber" />
        <IssueCard title="Empty Files" count={results.empty_files?.length || 0} items={results.empty_files?.map((f) => f.name) || []} icon={<AlertCircle size={16} />} color="red" />
        <IssueCard title="Oversized Files" count={results.oversized_files?.length || 0} items={results.oversized_files?.map((f) => `${f.name} (${formatBytes(f.size)})`) || []} icon={<HardDrive size={16} />} color="orange" />
        <IssueCard title="Unsupported Types" count={results.unsupported_types?.length || 0} items={results.unsupported_types?.map((f) => `${f.name} (.${f.extension})`) || []} icon={<XCircle size={16} />} color="red" />
        <IssueCard title="Unsynced Documents" count={results.unsynced_documents?.length || 0} items={results.unsynced_documents?.map((f) => f.name) || []} icon={<EyeOff size={16} />} color="amber" />
        <IssueCard title="Synced Documents" count={results.synced_documents?.length || 0} items={[]} icon={<CheckCircle size={16} />} color="green" />
      </div>
    </div>
  );
}


function IssueCard({ title, count, items, icon, color }) {
  const [expanded, setExpanded] = useState(false);
  const colorMap = {
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', iconBg: 'bg-red-100' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', iconBg: 'bg-amber-100' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', iconBg: 'bg-orange-100' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', iconBg: 'bg-green-100' },
  };
  const c = colorMap[color] || colorMap.amber;

  return (
    <div className={cn('rounded-2xl border p-5', count > 0 ? `${c.bg} ${c.border}` : 'bg-white border-slate-200/60')}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', count > 0 ? c.iconBg : 'bg-slate-100', count > 0 ? c.text : 'text-slate-400')}>
            {icon}
          </div>
          <span className="text-sm font-bold text-slate-800">{title}</span>
        </div>
        <span className={cn('text-lg font-bold', count > 0 ? c.text : 'text-slate-400')}>{count}</span>
      </div>
      {items.length > 0 && (
        <>
          <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-slate-500 hover:text-slate-700 mb-2 flex items-center gap-1">
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {items.map((item, idx) => (
                <p key={idx} className="text-[11px] text-slate-600 truncate">• {item}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ════════════════════════════════════════════════════════════════ */
function KBMetricCard({ label, value, icon, color, isText }) {
  const bgMap = {
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    brand: 'bg-brand-50 text-brand-600',
    slate: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', bgMap[color] || bgMap.purple)}>
          {icon}
        </div>
      </div>
      <div className="text-xl font-bold text-slate-900 tabular-nums">{isText ? value : value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5 font-medium">{label}</div>
    </div>
  );
}

function GuidelineItem({ icon, title, text }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{text}</p>
      </div>
    </div>
  );
}

function ProgressPill({ percent }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Loader2 size={12} className="animate-spin text-purple-600" />
      <span className="text-[10px] font-bold text-purple-600">{percent}%</span>
    </div>
  );
}


/* ── Helpers ── */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function getFileIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
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
}
