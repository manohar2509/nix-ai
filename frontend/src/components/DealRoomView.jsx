import React, { useState, useEffect } from 'react';
import { Briefcase, Loader2, Star, AlertTriangle, CheckCircle, TrendingUp, Shield, DollarSign, Globe, ArrowRight, FileDown } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import * as strategicService from '../services/strategicService';
import { cn } from '../utils/cn';

function formatUSD(val) {
  if (!val && val !== 0) return '—';
  const s = String(val);
  if (s.includes('$')) return s;
  const num = Number(val);
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  return `$${num.toLocaleString()}`;
}

export default function DealRoomView() {
  const currentDocument = useAppStore(s => s.currentDocument);
  const investorReport = useAppStore(s => s.investorReport);
  const portfolioRisk = useAppStore(s => s.portfolioRisk);
  const isReportLoading = useAppStore(s => s.isInvestorReportLoading);
  const isPortfolioLoading = useAppStore(s => s.isPortfolioLoading);
  const setReport = useAppStore(s => s.setInvestorReport);
  const setReportLoading = useAppStore(s => s.setIsInvestorReportLoading);
  const setPortfolio = useAppStore(s => s.setPortfolioRisk);
  const setPortfolioLoading = useAppStore(s => s.setIsPortfolioLoading);
  const [tab, setTab] = useState('report');

  useEffect(() => {
    if (!portfolioRisk && !isPortfolioLoading) {
      loadPortfolio();
    }
  }, []);

  const loadPortfolio = async () => {
    setPortfolioLoading(true);
    try {
      const result = await strategicService.getPortfolioRisk();
      setPortfolio(result);
    } catch (err) {
      console.error('Portfolio load failed:', err);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const generateReport = async () => {
    if (!currentDocument?.id) return;
    setReportLoading(true);
    try {
      const result = await strategicService.getInvestorReport(currentDocument.id);
      setReport(result);
    } catch (err) {
      console.error('Report failed:', err);
    } finally {
      setReportLoading(false);
    }
  };

  const riskBadge = (rating) => {
    const map = {
      'Low Risk': { color: 'bg-emerald-100 text-emerald-700', icon: '🟢' },
      'Moderate Risk': { color: 'bg-amber-100 text-amber-700', icon: '🟡' },
      'High Risk': { color: 'bg-orange-100 text-orange-700', icon: '🟠' },
      'Critical Risk': { color: 'bg-red-100 text-red-700', icon: '🔴' },
    };
    return map[rating] || map['Moderate Risk'];
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-white shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Briefcase size={22} />
          <h1 className="text-lg font-bold">Deal Room</h1>
        </div>
        <p className="text-slate-400 text-sm">Investor-ready due diligence reports and portfolio risk overview</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6 shrink-0">
        {[
          { key: 'report', label: 'Investor Report', icon: FileDown },
          { key: 'portfolio', label: 'Portfolio Risk', icon: TrendingUp },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              tab === t.key ? 'text-brand-700 border-brand-600' : 'text-slate-400 border-transparent hover:text-slate-700'
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'report' && (
          <div className="max-w-3xl mx-auto">
            {!currentDocument ? (
              <div className="text-center py-16">
                <Briefcase size={32} className="mx-auto text-slate-300 mb-3" />
                <h3 className="text-slate-600 font-semibold mb-1">No Protocol Selected</h3>
                <p className="text-slate-400 text-sm">Select a protocol from the sidebar to generate an investor report.</p>
              </div>
            ) : isReportLoading ? (
              <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                <div className="relative mb-6">
                  <div className="h-16 w-16 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin" />
                  <Briefcase size={20} className="absolute inset-0 m-auto text-brand-600" />
                </div>
                <h3 className="text-slate-800 font-bold text-lg mb-1">Generating Investor Report</h3>
                <p className="text-slate-400 text-sm">Creating due diligence package from analysis data...</p>
              </div>
            ) : !investorReport ? (
              <div className="text-center py-12">
                <Briefcase size={32} className="mx-auto text-slate-300 mb-3" />
                <h3 className="text-slate-600 font-semibold mb-1">Generate Investor Report</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto mb-4">
                  Create a VC-ready due diligence package for "<span className="font-medium text-slate-600">{currentDocument.name}</span>" with risk scores, market opportunity, and recommended actions.
                </p>
                <button onClick={generateReport} className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
                  Generate Report
                </button>
              </div>
            ) : (
              <ReportContent report={investorReport} riskBadge={riskBadge} onRegenerate={generateReport} />
            )}
          </div>
        )}

        {tab === 'portfolio' && (
          <div className="max-w-3xl mx-auto">
            {isPortfolioLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="h-12 w-12 rounded-full border-[3px] border-slate-100 border-t-brand-600 animate-spin mb-4" />
                <p className="text-sm text-slate-500">Loading portfolio...</p>
              </div>
            ) : (
              <PortfolioContent data={portfolioRisk} onRefresh={loadPortfolio} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportContent({ report, riskBadge, onRegenerate }) {
  const exec = report.executive_summary || {};
  const scorecard = report.regulatory_scorecard || {};
  const positioning = report.competitive_positioning || {};
  const financial = report.financial_risk_assessment || {};
  const redFlags = report.red_flags_for_diligence || [];
  const strengths = report.strengths_for_investors || [];
  const actions = report.recommended_actions_before_fundraise || [];
  const market = report.market_opportunity || {};
  const rb = riskBadge(exec.risk_rating);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-slate-900">{report.report_title || 'Regulatory Due Diligence Report'}</h2>
        {report.generated_date && <p className="text-xs text-slate-400 mt-1">{report.generated_date}</p>}
      </div>

      {/* Executive Summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Star size={14} className="text-amber-500" /> Executive Summary
        </h3>
        <div className="flex items-center gap-3 mb-3">
          <span className={cn('text-sm font-bold px-3 py-1 rounded-full', rb.color)}>{rb.icon} {exec.risk_rating}</span>
          <span className={cn('text-sm font-bold px-3 py-1 rounded-full',
            exec.investment_readiness === 'Ready' ? 'bg-emerald-100 text-emerald-700' :
            exec.investment_readiness === 'Conditionally Ready' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
          )}>
            {exec.investment_readiness}
          </span>
        </div>
        {exec.headline && <p className="text-lg font-semibold text-slate-900 mb-2">{exec.headline}</p>}
        {exec.one_paragraph_summary && <p className="text-sm text-slate-600 leading-relaxed">{exec.one_paragraph_summary}</p>}
      </div>

      {/* Regulatory Scorecard */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Shield size={14} className="text-brand-600" /> Regulatory Scorecard
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Regulatory', value: scorecard.regulatory_compliance, max: 100 },
            { label: 'Market Access', value: scorecard.market_access_readiness, max: 100 },
            { label: 'Global Ready', value: scorecard.global_readiness, max: 100 },
            { label: 'P(Approval)', value: scorecard.probability_of_approval_pct, max: 100, suffix: '%' },
          ].map(s => (
            <div key={s.label} className="text-center p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className={cn('text-2xl font-black',
                s.value >= 70 ? 'text-emerald-600' : s.value >= 50 ? 'text-amber-600' : 'text-red-600'
              )}>
                {s.value}{s.suffix || ''}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        {scorecard.explanation && <p className="text-xs text-slate-500 mt-2">{scorecard.explanation}</p>}
      </div>

      {/* Market Opportunity */}
      {market.indication && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Globe size={14} className="text-blue-600" /> Market Opportunity
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Indication:</span> <span className="font-medium text-slate-800">{market.indication}</span></div>
            <div><span className="text-slate-500">Patients:</span> <span className="font-medium text-slate-800">{market.estimated_patient_population}</span></div>
            <div><span className="text-slate-500">Peak Revenue:</span> <span className="font-bold text-emerald-600">{market.peak_revenue_potential}</span></div>
            <div><span className="text-slate-500">Time to Market:</span> <span className="font-medium text-slate-800">{market.time_to_market_estimate}</span></div>
          </div>
        </div>
      )}

      {/* Red Flags + Strengths */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1">
            <AlertTriangle size={12} /> Red Flags ({redFlags.length})
          </h4>
          <div className="space-y-2">
            {redFlags.map((f, i) => (
              <div key={i} className="text-xs text-slate-700">
                <span className={cn('font-bold px-1.5 py-0.5 rounded text-[10px] mr-1',
                  f.severity === 'critical' ? 'bg-red-100 text-red-700' : f.severity === 'major' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                )}>
                  {f.severity}
                </span>
                {f.flag}
                {f.mitigation && <span className="text-slate-400 ml-1">→ {f.mitigation}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="text-xs font-bold text-emerald-600 mb-2 flex items-center gap-1">
            <CheckCircle size={12} /> Strengths ({strengths.length})
          </h4>
          <div className="space-y-2">
            {strengths.map((s, i) => (
              <div key={i} className="text-xs text-slate-700">
                <span className="font-medium">{s.strength}</span>
                {s.evidence && <span className="text-slate-400 block text-[11px] mt-0.5">{s.evidence}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended Actions */}
      {actions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3">📋 Recommended Actions</h3>
          <div className="space-y-2">
            {actions.map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-slate-50 rounded-lg">
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                  a.priority === 'immediate' ? 'bg-red-100 text-red-700' :
                  a.priority === 'before_series_a' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                )}>
                  {a.priority?.replace('_', ' ')}
                </span>
                <div className="flex-1">
                  <span className="text-xs font-medium text-slate-800">{a.action}</span>
                  {a.estimated_cost && <span className="text-xs text-slate-400 ml-2">{a.estimated_cost}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onRegenerate} className="w-full py-2.5 text-sm font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
        Regenerate Report
      </button>
    </div>
  );
}

function PortfolioContent({ data, onRefresh }) {
  if (!data || !data.protocols?.length) {
    return (
      <div className="text-center py-12">
        <TrendingUp size={32} className="mx-auto text-slate-300 mb-3" />
        <h3 className="text-slate-600 font-semibold mb-1">No Portfolio Data</h3>
        <p className="text-slate-400 text-sm mb-4">Upload and analyze protocols to see your portfolio risk overview.</p>
        <button onClick={onRefresh} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors">
          Refresh
        </button>
      </div>
    );
  }

  const protocols = data.protocols || [];
  const attention = data.attention_needed || [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Portfolio Score */}
      <div className="bg-gradient-to-r from-brand-600 to-indigo-600 rounded-xl p-5 text-white">
        <div className="text-[10px] text-brand-200 uppercase font-bold mb-1">Portfolio Risk Score</div>
        <div className="text-4xl font-black">{data.portfolio_score}<span className="text-lg text-brand-200 font-normal">/100</span></div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div><div className="text-[10px] text-brand-200">Avg Regulatory</div><div className="text-xl font-bold">{data.average_regulatory_score}</div></div>
          <div><div className="text-[10px] text-brand-200">Avg Payer</div><div className="text-xl font-bold">{data.average_payer_score}</div></div>
          <div><div className="text-[10px] text-brand-200">Avg Global</div><div className="text-xl font-bold">{data.average_global_readiness}</div></div>
        </div>
        <div className="flex gap-4 mt-3 text-xs text-brand-200">
          <span>{data.total_protocols} protocols</span>
          <span>{data.total_critical_findings} critical findings</span>
        </div>
      </div>

      {/* Attention Needed */}
      {attention.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h4 className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
            <AlertTriangle size={12} /> Needs Attention ({attention.length})
          </h4>
          <div className="space-y-2">
            {attention.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-white rounded-lg border border-red-100">
                <span className="text-xs font-medium text-slate-800">{p.name}</span>
                <div className="flex gap-2 text-[11px]">
                  <span className={cn('font-bold', p.regulator_score < 60 ? 'text-red-600' : 'text-slate-600')}>Reg: {p.regulator_score}</span>
                  <span className={cn('font-bold', p.payer_score < 50 ? 'text-red-600' : 'text-slate-600')}>Pay: {p.payer_score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Protocols */}
      <div>
        <h4 className="text-xs font-bold text-slate-700 mb-2">All Protocols ({protocols.length})</h4>
        <div className="space-y-2">
          {protocols.map((p, i) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800">{p.name}</span>
                <div className="text-[10px] text-slate-400 mt-0.5">{p.findings_count} findings · {p.critical_findings} critical</div>
              </div>
              <div className="flex gap-3">
                {[
                  { label: 'Reg', value: p.regulator_score },
                  { label: 'Pay', value: p.payer_score },
                  { label: 'Global', value: p.global_readiness },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className={cn('text-sm font-bold',
                      s.value >= 70 ? 'text-emerald-600' : s.value >= 50 ? 'text-amber-600' : 'text-red-600'
                    )}>
                      {s.value}
                    </div>
                    <div className="text-[9px] text-slate-400">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onRefresh} className="w-full py-2 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors">
        Refresh Portfolio
      </button>
    </div>
  );
}
