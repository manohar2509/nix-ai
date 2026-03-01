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
import { UploadDialog } from './components/UploadDialog';
import Toast from './components/Toast';
import { useAppStore, useDocuments, useAnalysis } from './stores/useAppStore';
import { analysisService } from './services/analysisService';
import { documentService } from './services/documentService';

/* ── Main Dashboard Layout (Authenticated) ── */
function DashboardLayout() {
  const [activeTab, setActiveTab] = useState('analysis');
  const [showUpload, setShowUpload] = useState(false);

  const { currentDocument, documents } = useDocuments();
  const { isAnalyzing, lastAnalysis } = useAnalysis();
  const activeView = useAppStore((state) => state.activeView);

  const setIsAnalyzing = useAppStore((state) => state.setIsAnalyzing);
  const setLastAnalysis = useAppStore((state) => state.setLastAnalysis);
  const setDocuments = useAppStore((state) => state.setDocuments);
  const setCurrentDocument = useAppStore((state) => state.setCurrentDocument);
  const showToast = useAppStore((state) => state.showToast);

  const hasAnalyzed = !!lastAnalysis;

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
      showToast({ type: 'error', title: 'No document', message: 'Upload or select a document first.' });
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
        showToast({ type: 'success', title: 'Analysis complete', message: 'Conflict detection finished.' });
        return;
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
        showToast({ type: 'info', title: 'Analysis still processing', message: 'Running in the background. Check back shortly.' });
        return;
      }

      // 3. Fetch results
      const results = await analysisService.getAnalysisResults(currentDocument.id);
      setLastAnalysis(results);
      updateDocument(currentDocument.id, { status: 'analyzed' });
      setActiveTab('analysis');
      showToast({ type: 'success', title: 'Analysis complete', message: 'Conflict detection finished.' });
    } catch (err) {
      updateDocument(currentDocument.id, { status: 'error' });
      showToast({ type: 'error', title: 'Analysis failed', message: err.message });
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentDocument, setIsAnalyzing, setLastAnalysis, showToast]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 selection:bg-brand-100 selection:text-brand-900">
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
        ) : activeView === 'settings' ? (
          <main className="flex-1 overflow-hidden">
            <ConfigurationView />
          </main>
        ) : (
          /* Protocol view — editor + intelligence panel */
          <main className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 relative z-0">
              <EditorWindow hasAnalyzed={hasAnalyzed} currentDocument={currentDocument} />
            </div>

            <div className="w-[480px] bg-white border-l border-slate-200 shadow-xl flex flex-col z-10">
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
