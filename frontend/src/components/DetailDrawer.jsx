import React, { useEffect, useRef } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * DetailDrawer — Reusable slide-over panel for drilldown analytics views.
 * Used across Dashboard, Admin Analytics, Knowledge Base, etc.
 *
 * Props:
 *   open       - boolean, controls visibility
 *   onClose    - callback to close drawer
 *   title      - string, drawer heading
 *   subtitle   - optional string, secondary text
 *   icon       - optional JSX icon element
 *   width      - optional: 'md' | 'lg' | 'xl' (default 'lg')
 *   children   - drawer body content
 *   breadcrumb - optional array of { label, onClick? } for context
 */
export default function DetailDrawer({ open, onClose, title, subtitle, icon, width = 'lg', children, breadcrumb }) {
  const backdropRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  if (!open) return null;

  const widthClass = {
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[width] || 'max-w-2xl';

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end animate-fade-in"
    >
      <div className={cn(
        'w-full bg-white shadow-2xl flex flex-col h-full animate-slide-in-right',
        widthClass,
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {breadcrumb && breadcrumb.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                  {breadcrumb.map((crumb, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <ChevronRight size={10} className="text-slate-300" />}
                      {crumb.onClick ? (
                        <button onClick={crumb.onClick} className="hover:text-brand-600 transition-colors">
                          {crumb.label}
                        </button>
                      ) : (
                        <span>{crumb.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
              <h2 className="text-lg font-bold text-slate-900 truncate">{title}</h2>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}


/* ── Reusable detail sub-components ── */

export function DetailSection({ title, children, className }) {
  return (
    <div className={cn('mb-6', className)}>
      {title && (
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      )}
      {children}
    </div>
  );
}

export function DetailStat({ label, value, color, large }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
      <div className={cn(
        'font-bold tabular-nums',
        large ? 'text-2xl' : 'text-lg',
        color || 'text-slate-800',
      )}>
        {value}
      </div>
      <div className="text-[10px] text-slate-400 font-medium mt-0.5">{label}</div>
    </div>
  );
}

export function DetailList({ items, renderItem, emptyText = 'No items' }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-400">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {renderItem(item, idx)}
        </React.Fragment>
      ))}
    </div>
  );
}

export function DetailRow({ label, value, className }) {
  return (
    <div className={cn('flex items-center justify-between py-2 border-b border-slate-50', className)}>
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-700">{value}</span>
    </div>
  );
}
