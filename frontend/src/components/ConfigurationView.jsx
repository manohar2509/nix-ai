import React, { useState, useEffect } from 'react';
import {
  Settings, User, Sliders, Bell, Shield, Info, ChevronRight,
  Save, Check, ArrowLeft, Moon, Sun, Monitor, AlertTriangle,
  BarChart3, ShieldAlert, BadgeDollarSign, RotateCcw,
} from 'lucide-react';
import { useAuth, useAppStore } from '../stores/useAppStore';
import { applyCurrentTheme } from '../hooks/useTheme';
import { cn } from '../utils/cn';

const STORAGE_KEY = 'nixai-user-preferences';

function loadPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function savePreferences(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

const DEFAULT_PREFS = {
  // Analysis
  riskSensitivity: 'balanced',        // conservative | balanced | aggressive
  analysisFocus: 'both',              // regulatory | payer | both
  autoAnalyzeOnUpload: false,
  includeRecommendations: true,
  regulatoryThreshold: 50,            // Score below this = high risk
  payerThreshold: 50,

  // Notifications
  emailOnComplete: true,
  emailOnCritical: true,
  weeklyDigest: false,

  // Display
  theme: 'system',                    // light | dark | system
  compactMode: false,
  showConfidenceScores: true,
};

export default function ConfigurationView() {
  const { user, isAdmin } = useAuth();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const showToast = useAppStore((s) => s.showToast);

  const [prefs, setPrefs] = useState(() => ({
    ...DEFAULT_PREFS,
    ...(loadPreferences() || {}),
  }));
  const [saved, setSaved] = useState(true);
  const [activeSection, setActiveSection] = useState('profile');

  const updatePref = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    savePreferences(prefs);
    setSaved(true);
    applyCurrentTheme(); // Apply theme change immediately
    showToast({ type: 'success', title: 'Settings saved', message: 'Your preferences have been updated' });
  };

  const handleReset = () => {
    setPrefs({ ...DEFAULT_PREFS });
    setSaved(false);
  };

  const sections = [
    { id: 'profile', label: 'Profile', icon: <User size={16} /> },
    { id: 'analysis', label: 'Analysis Settings', icon: <Sliders size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'display', label: 'Display', icon: <Monitor size={16} /> },
    { id: 'about', label: 'About', icon: <Info size={16} /> },
  ];

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <Settings size={24} className="text-brand-600" />
              Settings
            </h1>
            <p className="text-sm text-slate-400 mt-1">Configure how the AI analyzes your clinical trial protocols and displays results</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('dashboard')}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft size={14} />
              Dashboard
            </button>
            {!saved && (
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
              >
                <Save size={14} />
                Save Changes
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar Nav */}
          <div className="w-56 shrink-0">
            <nav className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-2 space-y-0.5 sticky top-8">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    activeSection === s.id
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  )}
                >
                  <span className={cn(
                    'shrink-0',
                    activeSection === s.id ? 'text-brand-600' : 'text-slate-400'
                  )}>
                    {s.icon}
                  </span>
                  {s.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeSection === 'profile' && <ProfileSection user={user} isAdmin={isAdmin} />}
            {activeSection === 'analysis' && <AnalysisSection prefs={prefs} updatePref={updatePref} />}
            {activeSection === 'notifications' && <NotificationSection prefs={prefs} updatePref={updatePref} />}
            {activeSection === 'display' && <DisplaySection prefs={prefs} updatePref={updatePref} />}
            {activeSection === 'about' && <AboutSection />}

            {/* Save/Reset Footer */}
            {activeSection !== 'profile' && activeSection !== 'about' && (
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <RotateCcw size={14} />
                  Reset to Defaults
                </button>
                <button
                  onClick={handleSave}
                  disabled={saved}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all',
                    saved
                      ? 'bg-green-50 text-green-600 cursor-default'
                      : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                  )}
                >
                  {saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save Changes</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   Section Components
   ════════════════════════════════════════════════════════════════ */

function ProfileSection({ user, isAdmin }) {
  const initials = user?.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '??';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Banner */}
      <div className="h-24 bg-gradient-to-r from-brand-600 via-brand-600 to-purple-600 relative">
        <div className="absolute -bottom-10 left-8">
          <div className={cn(
            'h-20 w-20 rounded-2xl flex items-center justify-center text-xl font-bold text-white border-4 border-white shadow-lg',
            isAdmin ? 'bg-gradient-to-br from-purple-600 to-purple-700' : 'bg-gradient-to-br from-brand-600 to-brand-700'
          )}>
            {initials}
          </div>
        </div>
      </div>

      <div className="pt-14 px-8 pb-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{user?.name || 'User'}</h2>
            <p className="text-sm text-slate-400">{user?.email || ''}</p>
          </div>
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full',
            isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-brand-100 text-brand-700'
          )}>
            {isAdmin ? 'Admin' : 'Clinical'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Full Name" value={user?.name || 'Not set'} />
          <InfoField label="Email" value={user?.email || 'Not set'} />
          <InfoField label="Organization" value={user?.organization || 'Not set'} />
          <InfoField label="Role" value={isAdmin ? 'Administrator' : 'Clinical User'} />
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">Account managed by your organization</p>
              <p className="text-xs text-blue-600 mt-1">
                Profile details are synced from your identity provider. Contact your administrator to update.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function AnalysisSection({ prefs, updatePref }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Regulatory Risk Sensitivity" description="Control how cautiously the AI flags potential compliance and safety issues in your protocol">
        <div className="space-y-4">
          <OptionGroup
            options={[
              { value: 'conservative', label: 'Conservative (Recommended for Phase III/Pivotal)', desc: 'Flag all potential issues including low-confidence findings. Minimizes risk of missing a compliance gap. Best for registration-enabling trials.' },
              { value: 'balanced', label: 'Balanced (Standard)', desc: 'Flag medium and high-confidence issues. Appropriate for most clinical trial protocols across all phases.' },
              { value: 'aggressive', label: 'Focused (High Confidence Only)', desc: 'Only flag high-confidence, well-documented regulatory issues. Fewer findings but higher precision. Suitable for early-phase or exploratory studies.' },
            ]}
            selected={prefs.riskSensitivity}
            onChange={(v) => updatePref('riskSensitivity', v)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Analysis Focus Area" description="Choose which regulatory dimensions to prioritize during protocol analysis">
        <div className="space-y-4">
          <OptionGroup
            options={[
              { value: 'regulatory', label: 'Regulatory Compliance Only', desc: 'Focus on FDA/EMA/ICH compliance, GCP adherence, safety monitoring, and protocol design against regulatory requirements.' },
              { value: 'payer', label: 'Payer & Reimbursement Only', desc: 'Focus on Health Technology Assessment (HTA) body requirements, cost-effectiveness evidence, and reimbursement readiness (NICE, IQWiG, CADTH, PBAC).' },
              { value: 'both', label: 'Comprehensive Review (Recommended)', desc: 'Full analysis from both regulatory compliance and payer/reimbursement perspectives. Identifies friction points between regulatory approval and market access.' },
            ]}
            selected={prefs.analysisFocus}
            onChange={(v) => updatePref('analysisFocus', v)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Risk Score Thresholds" description="Set the score cutoffs that determine when a protocol is flagged as high risk on your dashboard">
        <div className="grid grid-cols-2 gap-6">
          <ThresholdSlider
            icon={<ShieldAlert size={14} className="text-red-500" />}
            label="Regulatory Compliance Threshold"
            value={prefs.regulatoryThreshold}
            onChange={(v) => updatePref('regulatoryThreshold', v)}
            description="Protocols scoring below this are flagged for regulatory review"
          />
          <ThresholdSlider
            icon={<BadgeDollarSign size={14} className="text-amber-500" />}
            label="Payer Readiness Threshold"
            value={prefs.payerThreshold}
            onChange={(v) => updatePref('payerThreshold', v)}
            description="Protocols scoring below this need stronger reimbursement evidence"
          />
        </div>
      </SectionCard>

      <SectionCard title="Workflow Automation" description="Configure automatic behaviors when working with protocols">
        <div className="space-y-4">
          <ToggleRow
            label="Auto-analyze on upload"
            description="Automatically start regulatory analysis when a new protocol is uploaded to your workspace"
            checked={prefs.autoAnalyzeOnUpload}
            onChange={(v) => updatePref('autoAnalyzeOnUpload', v)}
          />
          <ToggleRow
            label="Include actionable recommendations"
            description="Include AI-generated recommended actions and suggested protocol language alongside each finding"
            checked={prefs.includeRecommendations}
            onChange={(v) => updatePref('includeRecommendations', v)}
          />
        </div>
      </SectionCard>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Check size={16} className="text-green-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Settings are active</p>
            <p className="text-xs text-green-600 mt-1">
              These settings apply to all new protocol analyses. The AI will adjust its regulatory sensitivity, focus area, and risk scoring based on your configuration. Changes do not affect previously completed analyses.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


function NotificationSection({ prefs, updatePref }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Email Notifications" description="Control when you receive email alerts">
        <div className="space-y-4">
          <ToggleRow
            label="Analysis complete"
            description="Get notified when a protocol regulatory analysis finishes processing"
            checked={prefs.emailOnComplete}
            onChange={(v) => updatePref('emailOnComplete', v)}
          />
          <ToggleRow
            label="Critical finding alert"
            description="Immediate notification when critical-severity regulatory or safety findings are identified in your protocol"
            checked={prefs.emailOnCritical}
            onChange={(v) => updatePref('emailOnCritical', v)}
          />
          <ToggleRow
            label="Weekly summary"
            description="Weekly digest of all protocol analyses, findings, and compliance score changes"
            checked={prefs.weeklyDigest}
            onChange={(v) => updatePref('weeklyDigest', v)}
          />
        </div>
      </SectionCard>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Email notifications coming soon</p>
            <p className="text-xs text-amber-600 mt-1">
              Email notification settings are saved but delivery is not yet active. In-app notifications work immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


function DisplaySection({ prefs, updatePref }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Appearance" description="Customize how NIX AI looks">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-3 block">Theme</label>
            <div className="flex gap-3">
              {[
                { value: 'light', label: 'Light', icon: <Sun size={16} /> },
                { value: 'dark', label: 'Dark', icon: <Moon size={16} /> },
                { value: 'system', label: 'System', icon: <Monitor size={16} /> },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updatePref('theme', opt.value)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all flex-1',
                    prefs.theme === opt.value
                      ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Data Display" description="Control how analysis data is presented">
        <div className="space-y-4">
          <ToggleRow
            label="Compact mode"
            description="Show more findings on screen with reduced spacing"
            checked={prefs.compactMode}
            onChange={(v) => updatePref('compactMode', v)}
          />
          <ToggleRow
            label="Show confidence scores"
            description="Display AI confidence percentages alongside findings"
            checked={prefs.showConfidenceScores}
            onChange={(v) => updatePref('showConfidenceScores', v)}
          />
        </div>
      </SectionCard>
    </div>
  );
}


function AboutSection() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-8 text-center">
        <div className="h-16 w-16 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ring-1 ring-brand-400/20">
          <Shield size={28} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">NIX AI</h2>
        <p className="text-sm text-slate-400 mb-4">Regulatory Protocol Intelligence Platform</p>
        <div className="inline-flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-500">
          Version 1.0.0
        </div>
      </div>

      <SectionCard title="Platform" description="Technical details">
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="AI Engine" value="Amazon Bedrock (Claude)" />
          <InfoField label="Document Processing" value="Native + Textract" />
          <InfoField label="Knowledge Base" value="Bedrock Knowledge Base" />
          <InfoField label="Infrastructure" value="AWS Lambda + DynamoDB" />
        </div>
      </SectionCard>

      <SectionCard title="Capabilities" description="How NIX AI helps your clinical trial program">
        <div className="space-y-3">
          <CapabilityItem
            icon={<ShieldAlert size={16} className="text-red-500" />}
            title="Regulatory Compliance Analysis"
            description="Evaluates your protocol against ICH E6(R2)/E8/E9 guidelines, FDA 21 CFR requirements, and EMA scientific guidance to identify compliance gaps before submission"
          />
          <CapabilityItem
            icon={<BadgeDollarSign size={16} className="text-amber-500" />}
            title="Payer & Reimbursement Readiness"
            description="Assesses your protocol against HTA body requirements (NICE, IQWiG, CADTH, PBAC, AMNOG) to identify evidence gaps that could affect market access"
          />
          <CapabilityItem
            icon={<BarChart3 size={16} className="text-brand-500" />}
            title="Actionable Recommendations"
            description="AI-generated protocol amendments, suggested clause language, and strategic recommendations to resolve regulatory-payer friction points"
          />
        </div>
      </SectionCard>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   Shared UI Components
   ════════════════════════════════════════════════════════════════ */

function SectionCard({ title, description, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
      <div className="mb-5">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}


function InfoField({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}


function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4',
          checked ? 'bg-brand-600' : 'bg-slate-200'
        )}
      >
        <span className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
          checked ? 'translate-x-6' : 'translate-x-1'
        )} />
      </button>
    </div>
  );
}


function OptionGroup({ options, selected, onChange }) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex items-start gap-3 w-full p-3 rounded-xl border text-left transition-all',
            selected === opt.value
              ? 'bg-brand-50 border-brand-200'
              : 'bg-white border-slate-200 hover:border-slate-300'
          )}
        >
          <div className={cn(
            'mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
            selected === opt.value ? 'border-brand-600' : 'border-slate-300'
          )}>
            {selected === opt.value && <div className="h-2 w-2 rounded-full bg-brand-600" />}
          </div>
          <div>
            <div className={cn('text-sm font-semibold', selected === opt.value ? 'text-brand-700' : 'text-slate-700')}>
              {opt.label}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{opt.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}


function ThresholdSlider({ icon, label, value, onChange, description }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-semibold text-slate-600">{label}</span>
      </div>
      <input
        type="range"
        min={10}
        max={90}
        step={5}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-600"
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-slate-400">{description}</span>
        <span className="text-xs font-bold text-brand-600 tabular-nums">{value}%</span>
      </div>
    </div>
  );
}


function CapabilityItem({ icon, title, description }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
