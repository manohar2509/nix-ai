import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

/**
 * Toast Notification Component
 * 
 * Shows temporary notifications (success, error, info)
 * Auto-dismisses after 5 seconds
 * Can be manually closed
 */

export function Toast() {
  const notification = useAppStore((state) => state.notification);
  const showNotification = useAppStore((state) => state.showNotification);
  const hideToast = useAppStore((state) => state.hideToast);

  useEffect(() => {
    if (!showNotification) return;

    // Auto-dismiss after 5 seconds
    const timeout = setTimeout(() => {
      hideToast();
    }, 5000);

    return () => clearTimeout(timeout);
  }, [showNotification, hideToast]);

  if (!showNotification || !notification) return null;

  const bgColor =
    notification.type === 'success'
      ? 'bg-green-50 border-green-200'
      : notification.type === 'error'
      ? 'bg-red-50 border-red-200'
      : 'bg-blue-50 border-blue-200';

  const iconColor =
    notification.type === 'success'
      ? 'text-green-600'
      : notification.type === 'error'
      ? 'text-red-600'
      : 'text-blue-600';

  const Icon =
    notification.type === 'success'
      ? CheckCircle
      : notification.type === 'error'
      ? AlertCircle
      : Info;

  return (
    <div className={`fixed bottom-4 right-4 max-w-md p-4 rounded-lg border ${bgColor} shadow-lg flex items-start gap-3 animate-in slide-in-from-bottom-2 fade-in`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">
          {notification.title || 'Notification'}
        </p>
        {notification.message && (
          <p className="text-xs text-slate-600 mt-1">{notification.message}</p>
        )}
      </div>
      <button
        onClick={hideToast}
        className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default Toast;
