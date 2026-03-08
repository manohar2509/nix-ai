/**
 * ReportExport — REQ-8: Submission Readiness Report Generator
 *
 * Button + modal for generating and downloading comprehensive
 * regulatory submission readiness reports.
 */

import { useState } from 'react';
import { useAppStore, useRegulatory } from '../stores/useAppStore';
import { generateReport } from '../services/regulatoryService';
import { cn } from '../utils/cn';

export default function ReportExport({ docId, docName }) {
  const { report, isGeneratingReport } = useRegulatory();
  const store = useAppStore();
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!docId) return;
    setError(null);
    store.setIsGeneratingReport(true);

    try {
      const data = await generateReport(docId);
      store.setReport(data);
      setShowReport(true);
    } catch (err) {
      setError('Unable to generate the report. Please try again.');
    } finally {
      store.setIsGeneratingReport(false);
    }
  };

  const downloadAsJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regulatory-readiness-report-${docName || 'protocol'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsCsv = () => {
    if (!report) return;
    const rows = [['Section', 'Severity', 'Title', 'Description', 'Recommendation', 'Guideline References']];
    (report.findings || []).forEach((f) => {
      rows.push([
        f.section || '',
        f.severity || '',
        f.title || '',
        (f.description || '').replace(/[\n\r,]/g, ' '),
        (f.suggestion || '').replace(/[\n\r,]/g, ' '),
        (f.guideline_refs || []).map((r) => `${r.code || ''}${r.section ? ' §' + r.section : ''}`).join('; '),
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regulatory-findings-${docName || 'protocol'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button
        onClick={handleGenerate}
        disabled={isGeneratingReport || !docId}
        className="w-full px-4 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
      >
        {isGeneratingReport ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
            Generating Report...
          </span>
        ) : (
          '📋 Generate Full Submission Readiness Report'
        )}
      </button>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 mt-2">{error}</div>
      )}

      {/* Report Modal */}
      {showReport && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white rounded-t-2xl shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">📋 Submission Readiness Report</h3>
                <p className="text-xs text-slate-500 mt-0.5">{report.document?.name || docName}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAsCsv}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-sm font-medium text-emerald-700 rounded-lg transition-colors border border-emerald-200"
                >
                  ⬇️ Download CSV
                </button>
                <button
                  onClick={downloadAsJson}
                  className="px-3.5 py-2 bg-brand-50 hover:bg-brand-100 text-sm font-medium text-brand-700 rounded-lg transition-colors border border-brand-200"
                >
                  ⬇️ Download JSON
                </button>
                <button
                  onClick={() => setShowReport(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors text-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Report Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Executive Summary */}
              <ReportSection title="Executive Summary" icon="📊">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <ScoreCard label="Regulatory Compliance" value={report.executive_summary?.regulator_score} description="ICH/FDA/EMA compliance score for your protocol" />
                  <ScoreCard label="Payer & HTA Readiness" value={report.executive_summary?.payer_score} description="Health Technology Assessment body readiness score" />
                  <ScoreCard label="Global Submission Readiness" value={report.executive_summary?.global_readiness_score} description="Overall readiness for multi-jurisdiction regulatory submission" />
                </div>

                {report.executive_summary?.summary && (
                  <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed">{report.executive_summary.summary}</p>
                  </div>
                )}

                <div className="flex gap-4 mt-3">
                  <FindingCountBadge label="Critical" count={report.executive_summary?.critical_findings || 0} color="red" />
                  <FindingCountBadge label="High" count={report.executive_summary?.high_findings || 0} color="orange" />
                  <FindingCountBadge label="Total Findings" count={report.executive_summary?.total_findings || 0} color="slate" />
                </div>
              </ReportSection>

              {/* Jurisdiction Compass */}
              {report.jurisdiction_compass?.scores?.length > 0 && (
                <ReportSection title="Multi-Jurisdiction Compliance" icon="🌍" description="Regulatory compliance scores per region">
                  <div className="grid grid-cols-3 gap-3">
                    {report.jurisdiction_compass.scores.map((j, i) => (
                      <div key={i} className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{j.flag}</span>
                          <span className="text-xs font-semibold text-slate-800">{j.label}</span>
                        </div>
                        <div className="flex items-end gap-1">
                          <div className={cn('text-2xl font-bold',
                            j.compliance_score >= 75 ? 'text-emerald-600' :
                            j.compliance_score >= 50 ? 'text-amber-600' : 'text-red-600'
                          )}>
                            {Math.round(j.compliance_score)}%
                          </div>
                        </div>
                        <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full',
                            j.compliance_score >= 75 ? 'bg-emerald-500' :
                            j.compliance_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          )} style={{ width: `${j.compliance_score}%` }} />
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 capitalize">{j.risk_level} risk</div>
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Payer Analysis */}
              {report.payer_analysis?.gaps?.length > 0 && (
                <ReportSection title="Payer Evidence Gap Analysis" icon="💰" description="HTA body requirements and identified evidence gaps">
                  <div className="space-y-2">
                    {report.payer_analysis.gaps.map((g, i) => (
                      <div key={i} className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-bold text-white bg-slate-500 px-2 py-0.5 rounded">
                            {g.hta_body}
                          </span>
                          <span className={cn('text-[11px] font-bold uppercase px-1.5 py-0.5 rounded',
                            g.severity === 'critical' ? 'bg-red-100 text-red-700' :
                            g.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                            'bg-amber-100 text-amber-700'
                          )}>
                            {g.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700">{g.gap_description}</p>
                        {g.recommendation && (
                          <p className="text-xs text-brand-600 mt-1.5 bg-brand-50 p-2 rounded border border-brand-100">
                            💡 {g.recommendation}
                          </p>
                        )}
                        {g.guideline_refs?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {g.guideline_refs.map((r, ri) => {
                              const hasUrl = r.url && r.url !== '#';
                              const Tag = hasUrl ? 'a' : 'span';
                              const linkProps = hasUrl ? { href: r.url, target: '_blank', rel: 'noopener noreferrer' } : {};
                              return (
                                <Tag
                                  key={ri}
                                  {...linkProps}
                                  title={[r.title, r.relevance, hasUrl ? '↗ Click to open' : null].filter(Boolean).join('\n')}
                                  className={cn(
                                    'text-[11px] px-1.5 py-0.5 rounded border font-medium inline-flex items-center gap-1 transition-colors',
                                    'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
                                    hasUrl && 'cursor-pointer'
                                  )}
                                >
                                  {r.code}{r.section ? ` §${r.section}` : ''}
                                  {hasUrl && <span className="text-[9px] opacity-50">↗</span>}
                                </Tag>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Findings Summary */}
              {report.findings?.length > 0 && (
                <ReportSection title={`Detailed Findings (${report.findings.length})`} icon="🔍" description="All issues identified during protocol analysis">
                  <div className="space-y-2">
                    {report.findings.map((f, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                        <span className={`shrink-0 w-2.5 h-2.5 rounded-full mt-1.5 ${
                          f.severity === 'critical' ? 'bg-red-500' :
                          f.severity === 'high' ? 'bg-orange-500' :
                          f.severity === 'medium' ? 'bg-amber-500' :
                          'bg-emerald-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{f.title}</span>
                            <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full',
                              f.severity === 'critical' ? 'bg-red-100 text-red-700' :
                              f.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                              f.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                            )}>
                              {f.severity}
                            </span>
                          </div>
                          {f.description && (
                            <p className="text-xs text-slate-600 mt-1">{f.description}</p>
                          )}
                          {f.guideline_refs?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {f.guideline_refs.map((r, ri) => {
                                const hasUrl = r.url && r.url !== '#';
                                const Tag = hasUrl ? 'a' : 'span';
                                const linkProps = hasUrl ? { href: r.url, target: '_blank', rel: 'noopener noreferrer' } : {};
                                return (
                                  <Tag
                                    key={ri}
                                    {...linkProps}
                                    title={[r.title, r.section ? `Section ${r.section}` : null, r.relevance, hasUrl ? '↗ Click to open' : null].filter(Boolean).join('\n')}
                                    className={cn(
                                      'text-[11px] px-1.5 py-0.5 rounded border font-medium inline-flex items-center gap-1 transition-colors',
                                      r.source_type === 'FDA' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' :
                                      r.source_type === 'HTA' ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' :
                                      r.source_type === 'EMA' ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' :
                                      'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
                                      hasUrl && 'cursor-pointer'
                                    )}
                                  >
                                    {r.code}{r.section ? ` §${r.section}` : ''}
                                    {hasUrl && <span className="text-[9px] opacity-50">↗</span>}
                                  </Tag>
                                );
                              })}
                            </div>
                          )}
                          {f.suggestion && (
                            <p className="text-xs text-emerald-700 mt-1.5 p-2 bg-emerald-50 rounded border border-emerald-100">
                              💡 {f.suggestion}
                            </p>
                          )}
                          {f.suggested_clause && (
                            <div className="mt-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-700">
                              📝 <strong>Suggested clause:</strong> {f.suggested_clause}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}

              {/* Timeline */}
              {report.timeline?.length > 0 && (
                <ReportSection title="Audit Trail" icon="📅" description="Chronological log of all protocol events">
                  <div className="space-y-1">
                    {report.timeline.map((e, i) => (
                      <div key={i} className="flex gap-3 text-sm py-2 border-b border-slate-50 last:border-0">
                        <span className="text-slate-400 shrink-0 text-xs w-36 pt-0.5">
                          {e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}
                        </span>
                        <span className="text-slate-700 text-sm">{e.title}</span>
                      </div>
                    ))}
                  </div>
                </ReportSection>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Generated by NIX AI • {new Date().toLocaleDateString()}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={downloadAsCsv}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  ⬇️ CSV
                </button>
                <button
                  onClick={downloadAsJson}
                  className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  ⬇️ JSON
                </button>
                <button
                  onClick={() => setShowReport(false)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReportSection({ title, icon, description, children }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-white px-5 py-3 border-b border-slate-100">
        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </h4>
        {description && <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ScoreCard({ label, value, description }) {
  const score = Math.round(value || 0);
  const color = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-red-600';
  const bgColor = score >= 70 ? 'bg-emerald-50 border-emerald-200' : score >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const barColor = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={cn('p-4 rounded-xl border text-center', bgColor)}>
      <div className={cn('text-3xl font-bold', color)}>{score}%</div>
      <div className="text-xs font-semibold text-slate-700 mt-1">{label}</div>
      {description && <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{description}</div>}
      <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function FindingCountBadge({ label, count, color }) {
  const styles = {
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium', styles[color])}>
      <span className="font-bold">{count}</span>
      <span>{label}</span>
    </div>
  );
}
