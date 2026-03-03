import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import EditorWindow from './components/EditorWindow';
import IntelligencePanel from './components/IntelligencePanel';
import DashboardView from './components/DashboardView';
import PastAnalysisView from './components/PastAnalysisView';
import AdminAnalyticsView from './components/AdminAnalyticsView';
import ConfigurationView from './components/ConfigurationView';
import KnowledgeBaseView from './components/KnowledgeBaseView';
import ComparisonView from './components/ComparisonView';
import { UploadDialog } from './components/UploadDialog';
import Toast from './components/Toast';
import { useAppStore, useDocuments, useAnalysis } from './stores/useAppStore';
import { analysisService } from './services/analysisService';
import { documentService } from './services/documentService';
import { useThemeInit } from './hooks/useTheme';

/* ── Main Dashboard Layout (Authenticated) ── */
function DashboardLayout() {
  useThemeInit(); // Apply light/dark/system theme from user preferences
  const [activeTab, setActiveTab] = useState('analysis');
  const [showUpload, setShowUpload] = useState(false);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(480);
  const isDraggingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(480);

  const { currentDocument, documents } = useDocuments();
  const { isAnalyzing, lastAnalysis } = useAnalysis();
  const activeView = useAppStore((state) => state.activeView);

  const setIsAnalyzing = useAppStore((state) => state.setIsAnalyzing);
  const setLastAnalysis = useAppStore((state) => state.setLastAnalysis);
  const setDocuments = useAppStore((state) => state.setDocuments);
  const setCurrentDocument = useAppStore((state) => state.setCurrentDocument);
  const showToast = useAppStore((state) => state.showToast);

  const hasAnalyzed = !!lastAnalysis;

  // Helper: re-fetch document list from backend (source of truth)
  const _refreshDocuments = useCallback(async () => {
    try {
      const docs = await documentService.listDocuments();
      setDocuments(docs);
      // If current document was deleted on the backend, clear it
      if (currentDocument && !docs.find((d) => d.id === currentDocument.id)) {
        setCurrentDocument(docs.length > 0 ? docs[0] : null);
        setLastAnalysis(null);
      }
      // If current document status changed (e.g. worker finished), update it
      if (currentDocument) {
        const updated = docs.find((d) => d.id === currentDocument.id);
        if (updated && updated.status !== currentDocument.status) {
          setCurrentDocument(updated);
        }
      }
    } catch (err) {
      console.error('Failed to refresh documents:', err);
    }
  }, [currentDocument, setDocuments, setCurrentDocument, setLastAnalysis]);

  // Load user documents on mount
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const docs = await documentService.listDocuments();
        setDocuments(docs);
        // Auto-select first document if none selected
        if (docs.length > 0 && !currentDocument) {
          setCurrentDocument(docs[0]);
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
    };
    loadDocuments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic background refresh: picks up status changes from workers
  // (e.g. analysis completing in background, error states, etc.)
  useEffect(() => {
    const interval = setInterval(_refreshDocuments, 15000); // every 15s
    return () => clearInterval(interval);
  }, [_refreshDocuments]);

  // Auto-load analysis results when selecting a previously analyzed document
  const updateDocument = useAppStore((state) => state.updateDocument);
  useEffect(() => {
    if (!currentDocument?.id) return;
    if (currentDocument.status === 'analyzed' && !lastAnalysis) {
      analysisService.getAnalysisResults(currentDocument.id)
        .then((results) => setLastAnalysis(results))
        .catch(() => {}); // Silently ignore if no results
    }
    // Clear analysis when switching to a non-analyzed doc
    if (currentDocument.status !== 'analyzed') {
      setLastAnalysis(null);
    }
  }, [currentDocument?.id, currentDocument?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real analysis flow — calls backend → Bedrock → returns results
  // In local dev: analysis runs inline (no SQS), response comes back immediately
  // In production: analysis runs via SQS → Worker Lambda, frontend polls with backoff
  const handleAnalyze = useCallback(async () => {
    if (!currentDocument) {
      showToast({ type: 'error', title: 'No protocol selected', message: 'Upload or select a clinical trial protocol first.' });
      return;
    }
    setIsAnalyzing(true);
    // Optimistically update status in sidebar
    updateDocument(currentDocument.id, { status: 'analyzing' });
    try {
      // 1. Trigger analysis job
      const response = await analysisService.triggerAnalysis(currentDocument.id);
      const { jobId } = response;

      // ── Case: Inline execution (local dev — already finished) ──
      if (response.inline) {
        if (response.status === 'FAILED') throw new Error(response.error || 'Analysis failed');
        // Fetch results directly
        const results = await analysisService.getAnalysisResults(currentDocument.id);
        setLastAnalysis(results);
        updateDocument(currentDocument.id, { status: 'analyzed' });
        setActiveTab('analysis');
        showToast({ type: 'success', title: 'Regulatory analysis complete', message: 'Your protocol has been reviewed. View compliance findings in the Findings tab.' });
        // Refresh document list to get consistent state from backend
        _refreshDocuments();
        return; // Don't fall through to polling
      }

      // ── Case: SQS-queued (production) — poll with backoff ──
      const delays = [2000, 2000, 3000, 3000, 5000, 5000, 5000, 8000, 8000, 10000]; // ~51s total
      let status = response.status || 'QUEUED';
      for (const delay of delays) {
        if (status !== 'QUEUED' && status !== 'IN_PROGRESS') break;
        await new Promise((r) => setTimeout(r, delay));
        const result = await analysisService.getAnalysisStatus(jobId);
        status = result.status;
      }

      if (status === 'FAILED') throw new Error('Analysis failed');
      if (status !== 'COMPLETE') {
        showToast({ type: 'info', title: 'Analysis in progress', message: 'Your protocol is being reviewed in the background. Results will appear shortly.' });
        return;
      }

      // 3. Fetch results
      const results = await analysisService.getAnalysisResults(currentDocument.id);
      setLastAnalysis(results);
      updateDocument(currentDocument.id, { status: 'analyzed' });
      setActiveTab('analysis');
      showToast({ type: 'success', title: 'Regulatory analysis complete', message: 'Protocol review finished. Check the Findings tab for compliance results.' });
      // Refresh document list from backend for consistency
      _refreshDocuments();
    } catch (err) {
      updateDocument(currentDocument.id, { status: 'error' });
      showToast({ type: 'error', title: 'Analysis failed', message: err.message || 'The regulatory analysis could not be completed. Please try again.' });
      // Refresh document list to get backend truth (may have been set to 'error' by worker)
      _refreshDocuments();
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentDocument, setIsAnalyzing, setLastAnalysis, showToast]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 selection:bg-brand-100 selection:text-brand-900">
      <Sidebar
        onUpload={() => setShowUpload(true)}
        onSelectDocument={setCurrentDocument}
        documents={documents}
        currentDocument={currentDocument}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Only show Topbar in protocol view */}
        {activeView === 'protocol' && (
          <Topbar
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyze}
            onUpload={() => setShowUpload(true)}
            currentDocument={currentDocument}
          />
        )}

        {/* View Router */}
        {activeView === 'dashboard' ? (
          <main className="flex-1 overflow-hidden">
            <DashboardView />
          </main>
        ) : activeView === 'history' ? (
          <main className="flex-1 overflow-hidden">
            <PastAnalysisView />
          </main>
        ) : activeView === 'admin-analytics' ? (
          <main className="flex-1 overflow-hidden">
            <AdminAnalyticsView />
          </main>
        ) : activeView === 'knowledge-base' ? (
          <main className="flex-1 overflow-hidden">
            <KnowledgeBaseView />
          </main>
        ) : activeView === 'comparison' ? (
          <main className="flex-1 overflow-hidden">
            <ComparisonView />
          </main>
        ) : activeView === 'settings' ? (
          <main className="flex-1 overflow-hidden">
            <ConfigurationView />
          </main>
        ) : (
          /* Protocol view — editor + intelligence panel with resizable divider */
          <main className="flex-1 flex overflow-hidden relative">
            {/* Sliding Document Viewer */}
            <div
              className="relative z-0 min-w-0 overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                flex: editorCollapsed ? '0 0 0px' : '1 1 0%',
                minWidth: editorCollapsed ? 0 : '280px',
                opacity: editorCollapsed ? 0 : 1,
              }}
            >
              <EditorWindow hasAnalyzed={hasAnalyzed} currentDocument={currentDocument} />
            </div>

            {/* Resizable Divider Handle */}
            <div
              className="relative z-20 w-2 flex-shrink-0 cursor-col-resize group select-none"
              onMouseDown={(e) => {
                e.preventDefault();
                isDraggingRef.current = true;
                startXRef.current = e.clientX;
                startWidthRef.current = panelWidth;
                const onMove = (ev) => {
                  if (!isDraggingRef.current) return;
                  const delta = startXRef.current - ev.clientX;
                  const newWidth = Math.min(Math.max(startWidthRef.current + delta, 380), 900);
                  setPanelWidth(newWidth);
                };
                const onUp = () => {
                  isDraggingRef.current = false;
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-px h-full bg-slate-200 group-hover:bg-brand-400 transition-colors" />
              </div>
              {/* Toggle button embedded in divider */}
              <button
                onClick={() => setEditorCollapsed(!editorCollapsed)}
                className="absolute top-1/2 -translate-y-1/2 -left-3 z-30 w-6 h-10 bg-white border border-slate-200 rounded-md shadow-sm flex items-center justify-center hover:bg-slate-50 hover:border-brand-300 transition-all"
                title={editorCollapsed ? 'Show document panel' : 'Hide document panel'}
              >
                <svg
                  className={`w-3 h-3 text-slate-400 transition-transform ${editorCollapsed ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>

            {/* Intelligence Panel — uses set width or expands when editor is collapsed */}
            <div
              className="bg-white border-l border-slate-200/80 shadow-lg flex flex-col z-10 transition-all duration-300 overflow-hidden"
              style={{
                width: editorCollapsed ? '100%' : `${panelWidth}px`,
                minWidth: '380px',
                flex: editorCollapsed ? '1 1 0%' : 'none',
              }}
            >
              <IntelligencePanel
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                isAnalyzing={isAnalyzing}
                hasAnalyzed={hasAnalyzed}
                currentDocument={currentDocument}
                lastAnalysis={lastAnalysis}
              />
            </div>
          </main>
        )}
      </div>

      <UploadDialog isOpen={showUpload} onClose={() => setShowUpload(false)} />
      <Toast />
    </div>
  );
}

/* ── App Root with Routing ── */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
