import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Settings, ShieldCheck, LogOut, History, Database, FlaskConical, Upload, RefreshCw, FolderOpen, BarChart3 } from 'lucide-react';
import { useAuth, useAppStore, useUI } from '../stores/useAppStore';
import authService from '../services/authService';
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
  const [showDocList, setShowDocList] = useState(false);
  const syncInFlightRef = useRef(false);

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
        showToast({ type: 'info', title: 'KB Sync already running', message: `Job ${response.jobId} is already in progress` });
        return;
      }

      // ── Case 2: Inline execution (local dev — already finished) ──
      if (response.inline) {
        if (response.status === 'COMPLETE') {
          showToast({ type: 'success', title: 'KB Sync complete', message: 'Knowledge base re-indexed successfully' });
        } else if (response.status === 'FAILED') {
          showToast({ type: 'error', title: 'KB Sync failed', message: response.error || 'Check backend logs' });
        }
        return;
      }

      // ── Case 3: SQS-queued (production) — poll with backoff ──
      showToast({ type: 'success', title: 'KB Sync started', message: `Job ${response.jobId} queued` });
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
        showToast({ type: 'success', title: 'KB Sync complete', message: 'Knowledge base updated' });
      } else if (status === 'FAILED') {
        showToast({ type: 'error', title: 'KB Sync failed', message: 'Check logs for details' });
      } else {
        showToast({ type: 'info', title: 'KB Sync still processing', message: 'Running in the background. Check Job Monitor for updates.' });
      }
    } catch (err) {
      showToast({ type: 'error', title: 'KB Sync failed', message: err.message });
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
    <aside className="w-20 lg:w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-all duration-300 relative">
      {/* Top gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-500 to-transparent" />

      {/* Logo */}
      <div className="h-16 flex items-center px-4 lg:px-6 border-b border-slate-800/80">
        <div className="h-9 w-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center text-white shrink-0 shadow-glow ring-1 ring-brand-400/20">
          <ShieldCheck size={20} />
        </div>
        <div className="ml-3 hidden lg:block">
          <span className="font-bold text-lg text-white tracking-tight">NIX AI</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Systems Active</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] px-3 mb-3 hidden lg:block">
          Workspace
        </div>
        <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
        <NavItem icon={<FileText size={20} />} label="Active Protocol" active={activeView === 'protocol'} onClick={() => setActiveView('protocol')} />
        <NavItem icon={<History size={20} />} label="Past Analysis" active={activeView === 'history'} onClick={() => { setActiveView('history'); }} />

        {/* Upload Button */}
        <button
          onClick={onUpload}
          className="flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 bg-brand-600/10 hover:bg-brand-600/20 text-brand-600 group mt-2"
        >
          <Upload size={20} className="shrink-0" />
          <span className="font-medium text-sm hidden lg:block">Upload Document</span>
        </button>

        {/* Document List */}
        {documents.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowDocList(!showDocList)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] hover:text-slate-300 transition-colors"
            >
              <FolderOpen size={12} />
              <span className="hidden lg:block">Documents ({documents.length})</span>
            </button>
            {showDocList && (
              <div className="space-y-0.5 mt-1 max-h-40 overflow-y-auto">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => onSelectDocument(doc)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-all truncate',
                      currentDocument?.id === doc.id
                        ? 'bg-brand-500/20 text-brand-300'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                    )}
                  >
                    <FileText size={13} className="shrink-0" />
                    <span className="truncate hidden lg:block flex-1 text-left">{doc.name}</span>
                    {/* Status indicator */}
                    {doc.status === 'error' && (
                      <span className="shrink-0 h-2 w-2 rounded-full bg-red-500" title="Analysis failed" />
                    )}
                    {doc.status === 'analyzed' && (
                      <span className="shrink-0 h-2 w-2 rounded-full bg-green-500" title="Analyzed" />
                    )}
                    {doc.status === 'analyzing' && (
                      <span className="shrink-0 h-2 w-2 rounded-full bg-amber-400 animate-pulse" title="Analyzing..." />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Admin-only section */}
        {isAdmin && (
          <>
            <div className="pt-4 mt-4 border-t border-slate-800/60">
              <div className="text-[9px] font-bold text-purple-400/60 uppercase tracking-[0.2em] px-3 mb-3 hidden lg:block">
                Admin Tools
              </div>
              <NavItem icon={<Database size={20} />} label="Knowledge Base" adminItem active={activeView === 'knowledge-base'} onClick={() => setActiveView('knowledge-base')} />
              <NavItem icon={<BarChart3 size={20} />} label="Platform Analytics" adminItem active={activeView === 'admin-analytics'} onClick={() => setActiveView('admin-analytics')} />
              <NavItem icon={<FlaskConical size={20} />} label="Job Monitor" adminItem onClick={() => setActiveView('protocol')} />

              {/* KB Sync Button */}
              <button
                onClick={handleKbSync}
                disabled={isKbSyncing}
                className={cn(
                  'flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 mt-1',
                  isKbSyncing
                    ? 'bg-purple-500/10 text-purple-300 cursor-wait'
                    : 'hover:bg-purple-500/10 hover:text-purple-300 text-purple-400/50'
                )}
              >
                <RefreshCw size={20} className={cn('shrink-0', isKbSyncing && 'animate-spin')} />
                <span className="font-medium text-sm hidden lg:block">
                  {isKbSyncing ? 'Syncing KB...' : 'Sync Knowledge Base'}
                </span>
              </button>
            </div>
          </>
        )}

        <div className="pt-3 mt-3 border-t border-slate-800/60">
          <NavItem icon={<Settings size={20} />} label="Configuration" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
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
            {orgName && <div className="text-[10px] text-slate-500 truncate">{orgName}</div>}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
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

function NavItem({ icon, label, active, adminItem, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 group relative',
        active
          ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
          : adminItem
            ? 'hover:bg-purple-500/10 hover:text-purple-300'
            : 'hover:bg-slate-800/60 hover:text-white'
      )}
    >
      <span className={cn(
        'shrink-0 transition-colors',
        active
          ? 'text-white'
          : adminItem
            ? 'text-purple-400/50 group-hover:text-purple-300'
            : 'text-slate-500 group-hover:text-slate-200'
      )}>
        {icon}
      </span>
      <span className="font-medium text-sm hidden lg:block">{label}</span>
      {active && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white/30 rounded-l-full hidden lg:block" />
      )}
    </button>
  );
}
