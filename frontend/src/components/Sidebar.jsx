import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Settings, ShieldCheck, LogOut, History, Database, Briefcase, Upload, RefreshCw, FolderOpen, BarChart3, GitCompare, Trash2 } from 'lucide-react';
import { useAuth, useAppStore, useUI } from '../stores/useAppStore';
import authService from '../services/authService';
import documentService from '../services/documentService';
import { cn } from '../utils/cn';

export default function Sidebar({ onUpload, onSelectDocument, documents = [], currentDocument }) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { isKbSyncing } = useUI();
  const reset = useAppStore((state) => state.reset);
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setIsKbSyncing = useAppStore((state) => state.setIsKbSyncing);
  const showToast = useAppStore((state) => state.showToast);
  const [showDocList, setShowDocList] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const removeDocument = useAppStore((state) => state.removeDocument);
  const syncInFlightRef = useRef(false);

  const handleDeleteDocument = async (e, docId) => {
    e.stopPropagation();
    // Ignore clicks while a delete is already in flight
    if (deletingId) return;
    if (confirmDeleteId === docId) {
      setDeletingId(docId);
      try {
        // 1. Optimistically remove from UI FIRST for instant feedback
        removeDocument(docId);
        setConfirmDeleteId(null);
        // 2. Fire backend delete (already removed from UI, so user sees instant deletion)
        await documentService.deleteDocument(docId);
        showToast({ type: 'success', title: 'Protocol removed', message: 'The protocol has been deleted from your workspace.' });
      } catch (err) {
        // Backend failed — re-fetch to restore the document
        try {
          const freshDocs = await documentService.listDocuments();
          const store = useAppStore.getState();
          // Remove the doc ID from the recently-deleted guard so re-fetch restores it
          store.setState({
            _recentlyDeletedIds: (store._recentlyDeletedIds || []).filter((id) => id !== docId),
          });
          store.setDocuments(freshDocs);
          if (!store.currentDocument && freshDocs.length > 0) {
            store.setCurrentDocument(freshDocs[0]);
          }
        } catch { /* ignore re-fetch failure */ }
        showToast({ type: 'error', title: 'Unable to delete', message: 'Could not remove the protocol. Please try again.' });
      } finally {
        setDeletingId(null);
      }
    } else {
      setConfirmDeleteId(docId);
      // Auto-reset confirmation after 3 seconds
      setTimeout(() => setConfirmDeleteId((prev) => (prev === docId ? null : prev)), 3000);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // Force logout even on error
    }
    reset();
    navigate('/login', { replace: true });
  };

  const handleKbSync = useCallback(async () => {
    // Guard: prevent double-click and concurrent syncs
    if (syncInFlightRef.current || isKbSyncing) return;
    syncInFlightRef.current = true;
    setIsKbSyncing(true);
    try {
      const { kbService } = await import('../services/kbService');
      const response = await kbService.syncKnowledgeBase();

      // ── Case 1: Deduplicated — an active job already exists ──
      if (response.deduplicated) {
        showToast({ type: 'info', title: 'Sync already running', message: 'A knowledge base sync is already in progress. Please wait for it to complete.' });
        return;
      }

      // ── Case 2: Inline execution (local dev — already finished) ──
      if (response.inline) {
        if (response.status === 'COMPLETE') {
          showToast({ type: 'success', title: 'Sync complete', message: 'Knowledge base updated successfully.' });
        } else if (response.status === 'FAILED') {
          showToast({ type: 'error', title: 'Sync unsuccessful', message: 'The knowledge base sync could not be completed. Please try again later.' });
        }
        return;
      }

      // ── Case 3: SQS-queued (production) — poll with backoff ──
      showToast({ type: 'success', title: 'Sync started', message: 'Knowledge base sync is being processed...' });
      const { jobService } = await import('../services/jobService');
      const delays = [2000, 3000, 5000, 5000, 8000, 8000, 10000, 10000]; // ~51s total
      let status = response.status || 'QUEUED';
      for (const delay of delays) {
        await new Promise((r) => setTimeout(r, delay));
        const result = await jobService.getJobStatus(response.jobId);
        status = result.status;
        if (status !== 'QUEUED' && status !== 'IN_PROGRESS') break;
      }

      if (status === 'COMPLETE') {
        showToast({ type: 'success', title: 'Sync complete', message: 'Knowledge base updated successfully.' });
      } else if (status === 'FAILED') {
        showToast({ type: 'error', title: 'Sync unsuccessful', message: 'The knowledge base sync could not be completed. Please try again later.' });
      } else {
        showToast({ type: 'info', title: 'Sync in progress', message: 'The sync is still processing. You can check the status in the Job Monitor.' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Sync unsuccessful', message: 'Something went wrong while syncing the knowledge base. Please try again.' });
    } finally {
      setIsKbSyncing(false);
      syncInFlightRef.current = false;
    }
  }, [isKbSyncing, setIsKbSyncing, showToast]);

  const userInitials = user?.avatar || user?.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';
  const displayName = user?.name || 'User';
  const roleBadge = isAdmin ? 'Admin' : 'Clinical';
  const orgName = user?.organization || '';

  return (
    <aside data-tour="sidebar" className="w-20 lg:w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 relative">
      {/* Top gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-400/60 to-transparent" />

      {/* Logo */}
      <div className="h-16 flex items-center px-4 lg:px-6 border-b border-slate-800/80">
        <div className="h-9 w-9 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-brand-900/40 ring-1 ring-brand-400/20">
          <ShieldCheck size={20} />
        </div>
        <div className="ml-3 hidden lg:block">
          <span className="font-bold text-base text-white tracking-tight">NIX AI</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Systems Active</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* ── Workflow Section ── */}
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2 hidden lg:block">
          Workflow
        </div>
        <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" badge="Home" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} tooltip="Overview of all your clinical trial protocols, scores, and recent activity" dataTour="dashboard-nav" />
        <NavItem icon={<FileText size={18} />} label="Protocol Review" badge="Core" active={activeView === 'protocol'} onClick={() => setActiveView('protocol')} tooltip="Upload → Analyze → View findings, scores, and AI insights for your protocol" dataTour="protocol-nav" />
        <NavItem icon={<GitCompare size={18} />} label="Compare Protocols" active={activeView === 'comparison'} onClick={() => setActiveView('comparison')} tooltip="Side-by-side comparison of multiple protocol designs" dataTour="compare-nav" />

        {/* ── Reports Section ── */}
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mt-4 mb-2 hidden lg:block">
          Reports
        </div>
        <NavItem icon={<History size={18} />} label="Analysis History" active={activeView === 'history'} onClick={() => { setActiveView('history'); }} tooltip="Browse past regulatory and payer analyses" dataTour="history-nav" />
        <NavItem icon={<Briefcase size={18} />} label="Deal Room" active={activeView === 'dealroom'} onClick={() => setActiveView('dealroom')} tooltip="Investor-ready report with portfolio risk analysis and regulatory scorecard" dataTour="dealroom-nav" />

        {/* Upload Button */}
        <button
          onClick={onUpload}
          data-tour="upload-btn"
          className="flex items-center gap-3 w-full p-2.5 rounded-lg transition-all duration-200 bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 group mt-3 border border-brand-500/20"
        >
          <Upload size={18} className="shrink-0" />
          <span className="font-medium text-sm hidden lg:block">Upload Protocol</span>
        </button>

        {/* Document List */}
        {documents.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowDocList(!showDocList)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
            >
              <FolderOpen size={13} />
              <span className="hidden lg:block flex-1 text-left">My Protocols ({documents.length})</span>
              <svg className={cn('w-3 h-3 transition-transform hidden lg:block', showDocList ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDocList && (
              <div className="space-y-0.5 mt-1 max-h-60 overflow-y-auto pr-0.5">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => {
                      if (deletingId === doc.id) return;
                      onSelectDocument(doc);
                    }}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-xs transition-all truncate group',
                      deletingId === doc.id
                        ? 'opacity-40 pointer-events-none'
                        : currentDocument?.id === doc.id
                          ? 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-500/30'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    )}
                  >
                    <FileText size={13} className="shrink-0" />
                    <span className="truncate hidden lg:block flex-1 text-left">{doc.name}</span>
                    {/* Status indicator with label */}
                    {doc.status === 'error' && (
                      <span className="shrink-0 hidden lg:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400" title="Analysis failed">
                        Failed
                      </span>
                    )}
                    {doc.status === 'analyzed' && (
                      <span className="shrink-0 hidden lg:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400" title="Analysis complete">
                        Reviewed
                      </span>
                    )}
                    {doc.status === 'analyzing' && (
                      <span className="shrink-0 hidden lg:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 animate-pulse" title="Analysis in progress">
                        Running
                      </span>
                    )}
                    {(!doc.status || doc.status === 'uploaded') && (
                      <span className="shrink-0 hidden lg:inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-700/40 text-slate-500" title="Pending review">
                        Pending
                      </span>
                    )}
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDeleteDocument(e, doc.id)}
                      className={cn(
                        'shrink-0 p-1 rounded transition-colors hidden lg:block',
                        confirmDeleteId === doc.id
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'text-slate-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                      )}
                      title={confirmDeleteId === doc.id ? 'Click again to confirm removal' : 'Remove protocol'}
                    >
                      <Trash2 size={11} />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin-only section */}
        {isAdmin && (
          <>
            <div className="pt-3 mt-3 border-t border-slate-700/50">
              <div className="text-[11px] font-semibold text-purple-300/70 uppercase tracking-wider px-3 mb-2 hidden lg:block">
                Admin
              </div>
              <NavItem icon={<Database size={18} />} label="Reference Library" adminItem active={activeView === 'knowledge-base'} onClick={() => setActiveView('knowledge-base')} tooltip="Manage regulatory reference documents used by the AI" />
              <NavItem icon={<BarChart3 size={18} />} label="Platform Analytics" adminItem active={activeView === 'admin-analytics'} onClick={() => setActiveView('admin-analytics')} tooltip="Usage metrics, performance data, and system health" />
              <NavItem icon={<Briefcase size={18} />} label="Job Monitor" adminItem active={activeView === 'admin-analytics'} onClick={() => setActiveView('admin-analytics')} tooltip="Track background processing tasks and job status" />

              {/* KB Sync Button */}
              <button
                onClick={handleKbSync}
                disabled={isKbSyncing}
                className={cn(
                  'flex items-center gap-3 w-full p-2.5 rounded-lg transition-all duration-200 mt-1',
                  isKbSyncing
                    ? 'bg-purple-500/15 text-purple-300 cursor-wait'
                    : 'hover:bg-purple-500/15 hover:text-purple-300 text-purple-400/70'
                )}
              >
                <RefreshCw size={18} className={cn('shrink-0', isKbSyncing && 'animate-spin')} />
                <span className="font-medium text-sm hidden lg:block">
                  {isKbSyncing ? 'Updating...' : 'Update References'}
                </span>
              </button>
            </div>
          </>
        )}

        <div className="pt-3 mt-3 border-t border-slate-800/60">
          <NavItem icon={<Settings size={20} />} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} tooltip="Configure analysis preferences, thresholds, and display options" dataTour="settings-nav" />
        </div>
      </nav>

      {/* User Section */}
      <div className="p-3 border-t border-slate-800/60">
        <div className="flex items-center gap-3 w-full p-2.5 rounded-xl bg-slate-800/40 mb-2">
          <div className={cn(
            'h-9 w-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm border',
            isAdmin
              ? 'bg-gradient-to-br from-purple-600 to-purple-700 border-purple-500/30'
              : 'bg-gradient-to-br from-brand-600 to-brand-700 border-brand-500/30'
          )}>
            {userInitials}
          </div>
          <div className="hidden lg:block overflow-hidden flex-1">
            <div className="text-sm font-medium text-slate-200 truncate">{displayName}</div>
            {orgName && <div className="text-[11px] text-slate-400 truncate">{orgName}</div>}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                'text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                isAdmin
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-brand-500/20 text-brand-300'
              )}>
                {roleBadge}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-red-500/10 transition-all duration-200 text-left group"
        >
          <LogOut size={18} className="text-slate-600 group-hover:text-red-400 transition-colors shrink-0 mx-auto lg:mx-0" />
          <span className="text-sm font-medium text-slate-500 group-hover:text-red-400 transition-colors hidden lg:block">
            Sign Out
          </span>
        </button>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active, adminItem, onClick, tooltip, badge, dataTour }) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      data-tour={dataTour}
      className={cn(
        'flex items-center gap-3 w-full p-2.5 rounded-lg transition-all duration-200 group relative',
        active
          ? 'bg-brand-500/20 text-brand-200 shadow-sm'
          : adminItem
            ? 'hover:bg-purple-500/10 hover:text-purple-200 text-slate-400'
            : 'hover:bg-slate-800/60 hover:text-slate-100 text-slate-400'
      )}
    >
      <span className={cn(
        'shrink-0 transition-colors',
        active
          ? 'text-brand-300'
          : adminItem
            ? 'text-purple-400/60 group-hover:text-purple-300'
            : 'text-slate-500 group-hover:text-slate-300'
      )}>
        {icon}
      </span>
      <span className="font-medium text-sm hidden lg:block flex-1 text-left">{label}</span>
      {badge && (
        <span className={cn(
          'text-[9px] font-bold px-1.5 py-0.5 rounded-full hidden lg:inline-block',
          active ? 'bg-brand-400/20 text-brand-300' : 'bg-slate-700/50 text-slate-500'
        )}>
          {badge}
        </span>
      )}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-400 rounded-r-full hidden lg:block" />
      )}
    </button>
  );
}
