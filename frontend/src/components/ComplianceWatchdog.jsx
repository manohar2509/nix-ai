import React, { useState } from 'react';
import { Eye, Loader2, AlertTriangle, CheckCircle, Clock, Bell, Shield, ArrowRight } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import CacheStatusBanner from './CacheStatusBanner';
import { cn } from '../utils/cn';

const urgencyStyle = {
  immediate: { color: 'text-red-600', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700', icon: '🔴' },
  next_review: { color: 'text-amber-600', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', icon: '🟡' },
  monitor: { color: 'text-emerald-600', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700', icon: '🟢' },
};

const complianceStyle = {
  non_compliant: { label: 'Non-Compliant', color: 'bg-red-100 text-red-700' },
  partial: { label: 'Partial', color: 'bg-amber-100 text-amber-700' },
  compliant: { label: 'Compliant', color: 'bg-emerald-100 text-emerald-700' },
  not_applicable: { label: 'N/A', color: 'bg-slate-100 text-slate-500' },
};

export default function ComplianceWatchdog({ docId, generatedAt }) {
  const watchdog = useAppStore(s => s.watchdogAlerts);
  const isLoading = useAppStore(s => s.isWatchdogLoading);
  const setWatchdog = useAppStore(s => s.setWatchdogAlerts);
  const setLoading = useAppStore(s => s.setIsWatchdogLoading);
  const [expandedId, setExpandedId] = useState(null);

  const scan = async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const result = await strategicService.runWatchdog(docId);
      setWatchdog(result);
      useAppStore.getState().updateStrategicTimestamp('watchdog', new Date().toISOString());
    } catch (err) {
      console.error('Watchdog failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="relative mb-6">
          <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-orange-500 animate-spin" />
          <Eye size={20} className="absolute inset-0 m-auto text-orange-600" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg mb-1">Scanning for Compliance Drift</h3>
        <p className="text-slate-400 text-sm">Checking your protocol against 8 recent regulatory updates...</p>
      </div>
    );
  }

  if (!watchdog) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-20 w-20 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <Eye size={28} className="text-slate-400" />
        </div>
        <h3 className="text-slate-700 font-bold mb-1">Regulatory Change Scanner</h3>
        <p className="text-slate-400 text-sm max-w-sm mb-4">Scan your protocol against recent regulatory updates (ICH E6(R3), FDA Diversity Plans, EU HTA Regulation, etc.) to detect compliance drift and required changes.</p>
        <button onClick={scan} className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
          Run Compliance Scan
        </button>
      </div>
    );
  }

  const alerts = (watchdog.alerts || []).filter(a => a.affects_protocol);
  const nonAffecting = (watchdog.alerts || []).filter(a => !a.affects_protocol);
  const actions = watchdog.recommended_priority_actions || [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Score Impact */}
      <div className={cn(
        'rounded-xl p-4 border',
        watchdog.score_delta < -10 ? 'bg-red-50 border-red-200' : watchdog.score_delta < 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-orange-500" />
            <span className="text-sm font-bold text-slate-800">Compliance Drift Assessment</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400">Score change:</span>
            <span className={cn('text-lg font-black',
              watchdog.score_delta < 0 ? 'text-red-600' : 'text-emerald-600'
            )}>
              {watchdog.score_delta > 0 ? '+' : ''}{watchdog.score_delta}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-2">
          <div className="bg-white rounded-lg p-2 border border-slate-200">
            <div className="text-[10px] text-slate-400">Original</div>
            <div className="text-lg font-bold text-slate-800">{watchdog.compliance_score_current}</div>
          </div>
          <div className="bg-white rounded-lg p-2 border border-slate-200">
            <div className="text-[10px] text-slate-400">Adjusted</div>
            <div className={cn('text-lg font-bold', watchdog.compliance_score_adjusted < watchdog.compliance_score_current ? 'text-red-600' : 'text-emerald-600')}>
              {watchdog.compliance_score_adjusted}
            </div>
          </div>
          <div className="bg-white rounded-lg p-2 border border-slate-200">
            <div className="text-[10px] text-slate-400">Alerts</div>
            <div className="text-lg font-bold text-orange-600">{watchdog.total_affected_updates}</div>
          </div>
        </div>
        {watchdog.compliance_decay_summary && (
          <p className="text-xs text-slate-600">{watchdog.compliance_decay_summary}</p>
        )}
      </div>

      {/* Affecting Alerts */}
      {alerts.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
            <Bell size={12} className="text-red-500" /> Affecting Your Protocol ({alerts.length})
          </h4>
          <div className="space-y-2">
            {alerts.map((alert) => {
              const us = urgencyStyle[alert.urgency] || urgencyStyle.monitor;
              const cs = complianceStyle[alert.current_compliance] || complianceStyle.not_applicable;
              const isExpanded = expandedId === alert.update_id;

              return (
                <div key={alert.update_id} className={cn('rounded-lg border', us.bg, 'border-slate-200 cursor-pointer hover:shadow-md transition-all')}
                  onClick={() => setExpandedId(isExpanded ? null : alert.update_id)}
                >
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span>{us.icon}</span>
                        <span className="text-xs font-bold text-slate-800">{alert.guideline_code}</span>
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase', us.badge)}>
                          {alert.urgency?.replace('_', ' ')}
                        </span>
                        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', cs.color)}>{cs.label}</span>
                      </div>
                      {alert.score_impact !== 0 && (
                        <span className={cn('text-sm font-bold', alert.score_impact < 0 ? 'text-red-600' : 'text-emerald-600')}>
                          {alert.score_impact > 0 ? '+' : ''}{alert.score_impact}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-700">{alert.title}</p>
                    <div className="flex gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span>{alert.issuing_body}</span>
                      <span>Published: {alert.published_date}</span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-slate-200/60 animate-fade-in">
                        <p className="text-[11px] text-slate-600 leading-relaxed">{alert.impact_summary}</p>
                        {alert.affected_sections?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {alert.affected_sections.map((s, i) => (
                              <span key={i} className="text-[9px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{s}</span>
                            ))}
                          </div>
                        )}
                        {alert.required_changes?.length > 0 && (
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <div className="text-[10px] font-bold text-slate-600 mb-1">Required Changes:</div>
                            <ul className="space-y-0.5">
                              {alert.required_changes.map((c, i) => (
                                <li key={i} className="text-[11px] text-slate-600 flex items-start gap-1">
                                  <ArrowRight size={9} className="mt-1 shrink-0 text-brand-500" />{c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Non-affecting */}
      {nonAffecting.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 mb-2">Not Affecting ({nonAffecting.length})</h4>
          <div className="space-y-1">
            {nonAffecting.map((a) => (
              <div key={a.update_id} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                <span className="text-[11px] text-slate-600"><span className="font-medium">{a.guideline_code}</span> — {a.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priority Actions */}
      {actions.length > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
          <h4 className="text-xs font-bold text-brand-700 mb-2">🎯 Priority Actions</h4>
          <div className="space-y-1.5">
            {actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="font-bold text-brand-600 shrink-0">#{action.priority}</span>
                <div>
                  <span className="text-slate-700 font-medium">{action.action}</span>
                  {action.addresses_updates?.length > 0 && (
                    <span className="text-slate-400 ml-1">(addresses {action.addresses_updates.join(', ')})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CacheStatusBanner
        generatedAt={generatedAt}
        onRegenerate={scan}
        isLoading={isLoading}
        label="compliance scan"
      />
    </div>
  );
}
