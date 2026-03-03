import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Loader2, ChevronRight, FileText, LogOut, User, ChevronDown, Upload } from 'lucide-react';
import { useAuth, useAppStore } from '../stores/useAppStore';
import authService from '../services/authService';
import { cn } from '../utils/cn';

export default function Topbar({ isAnalyzing, onAnalyze, onUpload, currentDocument }) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const reset = useAppStore((state) => state.reset);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    setShowMenu(false);
    try {
      await authService.logout();
    } catch {
      // Force logout even on error
    }
    reset();
    navigate('/login', { replace: true });
  };

  return (
    <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-4 sm:px-6 z-20 sticky top-0 shadow-sm shadow-slate-100/50">
      {/* Breadcrumb + File */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
          <FileText size={13} />
          <span>Clinical Protocols</span>
          <ChevronRight size={11} />
        </div>
        <h1 className="text-sm font-semibold text-slate-800 flex items-center gap-2.5 min-w-0">
          <span className="truncate">{currentDocument?.name || 'No protocol selected'}</span>
          {currentDocument && (
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ring-1',
              currentDocument.status === 'analyzed'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60'
                : currentDocument.status === 'error'
                  ? 'bg-red-50 text-red-700 ring-red-200/60'
                  : currentDocument.status === 'analyzing'
                    ? 'bg-amber-50 text-amber-700 ring-amber-200/60 animate-pulse'
                    : 'bg-slate-50 text-slate-600 ring-slate-200/60'
            )}>
              {currentDocument.status === 'analyzed' ? 'Reviewed'
                : currentDocument.status === 'analyzing' ? 'Analyzing'
                : currentDocument.status === 'error' ? 'Failed'
                : 'Pending Review'}
            </span>
          )}
        </h1>
      </div>

      {/* Actions + User */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUpload}
          className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-all"
          title="Upload Protocol"
        >
          <Upload size={16} />
        </button>
        <div className="h-5 w-px bg-slate-200 mx-1" />

        <button
          onClick={onAnalyze}
          disabled={isAnalyzing || !currentDocument}
          title={!currentDocument ? 'Upload a clinical trial protocol first to run regulatory analysis' : 'Run AI-powered regulatory and payer analysis on this protocol'}
          className={cn(
            'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all duration-300',
            !currentDocument
              ? 'bg-slate-300 cursor-not-allowed shadow-none'
              : isAnalyzing
                ? 'bg-slate-700 cursor-wait shadow-md'
                : 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-md shadow-brand-600/20 hover:shadow-lg hover:shadow-brand-500/25'
          )}
        >
          {isAnalyzing ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : !currentDocument ? (
            <>
              <Upload size={14} />
              <span>Upload Protocol</span>
            </>
          ) : (
            <>
              <Play size={14} fill="currentColor" />
              <span>
                {currentDocument?.status === 'error' ? 'Retry Analysis'
                  : currentDocument?.status === 'analyzed' ? 'Re-run Analysis'
                  : 'Run Regulatory Analysis'}
              </span>
            </>
          )}
        </button>

        <div className="h-5 w-px bg-slate-200 mx-1" />

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl hover:bg-slate-100 transition-all group"
          >
            <div className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0',
              isAdmin
                ? 'bg-gradient-to-br from-purple-600 to-purple-700'
                : 'bg-gradient-to-br from-brand-600 to-brand-700'
            )}>
              {user?.avatar || 'U'}
            </div>
            <div className="hidden xl:block text-left">
              <div className="text-xs font-semibold text-slate-700 leading-tight">{user?.name || 'User'}</div>
              <div className="text-[11px] text-slate-500">{isAdmin ? 'Admin' : 'Clinical'}</div>
            </div>
            <ChevronDown size={14} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 py-2 z-50 animate-fade-in">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <div className="text-sm font-semibold text-slate-900">{user?.name}</div>
                <div className="text-xs text-slate-500">{user?.email}</div>
                {user?.organization && <div className="text-[10px] text-slate-400 mt-0.5">{user.organization}</div>}
                {user?.jobTitle && <div className="text-[10px] text-slate-400">{user.jobTitle}</div>}
                <span className={cn(
                  'inline-block mt-1.5 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                  isAdmin
                    ? 'bg-purple-50 text-purple-700'
                    : 'bg-brand-50 text-brand-700'
                )}>
                  {user?.role}
                </span>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setShowMenu(false); useAppStore.getState().setActiveView('settings'); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <User size={15} /> Profile & Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={15} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
