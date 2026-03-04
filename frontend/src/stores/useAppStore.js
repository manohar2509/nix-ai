import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

/**
 * Main application store using Zustand.
 * Handles: auth, documents, analysis, chat, jobs, UI state
 * 
 * This is the single source of truth for all app state.
 * All components subscribe to relevant slices only (via selectors).
 */

export const useAppStore = create(
  devtools(
    (set, get) => ({
      // ============================================================================
      // AUTH STATE
      // ============================================================================
      user: null,
      isAuthLoading: true,
      isAuthenticated: false,
      authError: null,

      setUser: (user) =>
        set(
          {
            user,
            isAuthenticated: !!user,
            authError: null,
          },
          false,
          'setUser'
        ),

      setAuthLoading: (bool) =>
        set({ isAuthLoading: bool }, false, 'setAuthLoading'),

      setAuthError: (error) =>
        set({ authError: error }, false, 'setAuthError'),

      clearAuth: () =>
        set(
          {
            user: null,
            isAuthenticated: false,
            authError: null,
          },
          false,
          'clearAuth'
        ),

      // ============================================================================
      // DOCUMENT STATE
      // ============================================================================
      currentDocument: null,
      documents: [],
      isDocumentLoading: false,
      documentError: null,
      isUploading: false,
      uploadProgress: 0,

      setCurrentDocument: (doc) =>
        set({ currentDocument: doc }, false, 'setCurrentDocument'),

      setDocuments: (docs) =>
        set({ documents: docs }, false, 'setDocuments'),

      addDocument: (doc) =>
        set(
          (state) => ({
            documents: [doc, ...state.documents],
          }),
          false,
          'addDocument'
        ),

      updateDocument: (docId, updates) =>
        set(
          (state) => ({
            documents: state.documents.map((doc) =>
              doc.id === docId ? { ...doc, ...updates } : doc
            ),
            currentDocument:
              state.currentDocument?.id === docId
                ? { ...state.currentDocument, ...updates }
                : state.currentDocument,
          }),
          false,
          'updateDocument'
        ),

      setIsDocumentLoading: (bool) =>
        set({ isDocumentLoading: bool }, false, 'setIsDocumentLoading'),

      setDocumentError: (error) =>
        set({ documentError: error }, false, 'setDocumentError'),

      removeDocument: (docId) =>
        set(
          (state) => {
            const remainingDocs = state.documents.filter((d) => d.id !== docId);
            const wasCurrentDoc = state.currentDocument?.id === docId;
            return {
              documents: remainingDocs,
              currentDocument: wasCurrentDoc
                ? (remainingDocs.length > 0 ? remainingDocs[0] : null)
                : state.currentDocument,
              // Clear stale analysis data when the viewed document is deleted
              lastAnalysis: wasCurrentDoc ? null : state.lastAnalysis,
              // Reset chat tied to deleted doc
              chatMessages: wasCurrentDoc ? [] : state.chatMessages,
              chatConversationId: wasCurrentDoc ? null : state.chatConversationId,
            };
          },
          false,
          'removeDocument'
        ),

      setIsUploading: (bool) =>
        set({ isUploading: bool }, false, 'setIsUploading'),

      setUploadProgress: (progress) =>
        set({ uploadProgress: progress }, false, 'setUploadProgress'),

      // ============================================================================
      // ANALYSIS STATE
      // ============================================================================
      lastAnalysis: null,
      isAnalyzing: false,
      analysisError: null,
      analysisHistory: [], // Previous analyses for timeline view

      setLastAnalysis: (analysis) =>
        set({ lastAnalysis: analysis }, false, 'setLastAnalysis'),

      setIsAnalyzing: (bool) =>
        set({ isAnalyzing: bool }, false, 'setIsAnalyzing'),

      setAnalysisError: (error) =>
        set({ analysisError: error }, false, 'setAnalysisError'),

      addAnalysisToHistory: (analysis) =>
        set(
          (state) => ({
            analysisHistory: [analysis, ...state.analysisHistory],
          }),
          false,
          'addAnalysisToHistory'
        ),

      clearAnalysisHistory: () =>
        set({ analysisHistory: [] }, false, 'clearAnalysisHistory'),

      // ============================================================================
      // CHAT STATE
      // ============================================================================
      chatMessages: [],
      isChatLoading: false,
      chatError: null,
      chatConversationId: null,

      addChatMessage: (message) =>
        set(
          (state) => ({
            chatMessages: [...state.chatMessages, message],
          }),
          false,
          'addChatMessage'
        ),

      updateChatMessage: (messageId, updates) =>
        set(
          (state) => ({
            chatMessages: state.chatMessages.map((msg) =>
              msg.id === messageId ? { ...msg, ...updates } : msg
            ),
          }),
          false,
          'updateChatMessage'
        ),

      setChatMessages: (messages) =>
        set({ chatMessages: messages }, false, 'setChatMessages'),

      setIsChatLoading: (bool) =>
        set({ isChatLoading: bool }, false, 'setIsChatLoading'),

      setChatError: (error) =>
        set({ chatError: error }, false, 'setChatError'),

      setChatConversationId: (id) =>
        set({ chatConversationId: id }, false, 'setChatConversationId'),

      clearChatMessages: () =>
        set({ chatMessages: [] }, false, 'clearChatMessages'),

      // ============================================================================
      // ADMIN: JOB STATE (Analysis, KB Sync)
      // ============================================================================
      activeJobs: [], // Currently processing
      completedJobs: [], // Finished (download-ready)
      failedJobs: [],
      jobPollingActive: false,
      jobPollingIntervals: {}, // Map of jobId -> intervalId

      addActiveJob: (job) =>
        set(
          (state) => ({
            activeJobs: [...state.activeJobs, job],
          }),
          false,
          'addActiveJob'
        ),

      updateActiveJob: (jobId, updates) =>
        set(
          (state) => ({
            activeJobs: state.activeJobs.map((job) =>
              job.id === jobId ? { ...job, ...updates } : job
            ),
          }),
          false,
          'updateActiveJob'
        ),

      moveJobToCompleted: (jobId) =>
        set(
          (state) => {
            const job = state.activeJobs.find((j) => j.id === jobId);
            if (!job) return state;
            return {
              activeJobs: state.activeJobs.filter((j) => j.id !== jobId),
              completedJobs: [...state.completedJobs, { ...job, status: 'COMPLETE' }],
            };
          },
          false,
          'moveJobToCompleted'
        ),

      moveJobToFailed: (jobId, error) =>
        set(
          (state) => {
            const job = state.activeJobs.find((j) => j.id === jobId);
            if (!job) return state;
            return {
              activeJobs: state.activeJobs.filter((j) => j.id !== jobId),
              failedJobs: [...state.failedJobs, { ...job, status: 'FAILED', error }],
            };
          },
          false,
          'moveJobToFailed'
        ),

      clearCompletedJobs: () =>
        set({ completedJobs: [] }, false, 'clearCompletedJobs'),

      setJobPollingActive: (bool) =>
        set({ jobPollingActive: bool }, false, 'setJobPollingActive'),

      registerJobPollingInterval: (jobId, intervalId) =>
        set(
          (state) => ({
            jobPollingIntervals: { ...state.jobPollingIntervals, [jobId]: intervalId },
          }),
          false,
          'registerJobPollingInterval'
        ),

      unregisterJobPollingInterval: (jobId) =>
        set(
          (state) => {
            const { [jobId]: _, ...rest } = state.jobPollingIntervals;
            return { jobPollingIntervals: rest };
          },
          false,
          'unregisterJobPollingInterval'
        ),

      // ============================================================================
      // ADMIN: KNOWLEDGE BASE STATE (curated reference docs for Bedrock RAG)
      //
      // KB documents are SEPARATE from user documents.  They live in the
      // KB S3 bucket (nixai-clinical-kb) and are indexed by Bedrock for RAG.
      // User documents live in the uploads bucket and are NEVER in RAG.
      // ============================================================================
      kbDocuments: [],          // KB_DOCUMENT entities (admin-curated)
      isKbLoading: false,       // Loading KB document list
      kbStats: null,            // { total_documents, total_size, categories }

      setKbDocuments: (docs) =>
        set({ kbDocuments: docs }, false, 'setKbDocuments'),

      addKbDocument: (doc) =>
        set(
          (state) => ({ kbDocuments: [doc, ...state.kbDocuments] }),
          false,
          'addKbDocument'
        ),

      removeKbDocument: (kbDocId) =>
        set(
          (state) => ({
            kbDocuments: state.kbDocuments.filter((d) => d.id !== kbDocId),
          }),
          false,
          'removeKbDocument'
        ),

      setIsKbLoading: (bool) =>
        set({ isKbLoading: bool }, false, 'setIsKbLoading'),

      setKbStats: (stats) =>
        set({ kbStats: stats }, false, 'setKbStats'),

      // ============================================================================
      // UI STATE
      // ============================================================================
      activeView: 'protocol', // 'dashboard' | 'protocol' | 'history' | 'admin-analytics' | 'settings' | 'comparison' | 'benchmark'
      activeTab: 'analysis', // 'analysis' | 'chat' | 'factory' (admin only) | 'jurisdiction' | 'payer' | 'simulation' | 'timeline'
      sidebarExpanded: true,
      selectedSection: null, // Section ID highlighted in EditorWindow
      showNotification: false,
      notification: null, // { type: 'success'|'error'|'info', message }
      isKbSyncing: false, // Knowledge base is updating

      // ============================================================================
      // REGULATORY INTELLIGENCE STATE (REQ-1 through REQ-10)
      // ============================================================================
      jurisdictionScores: [],       // REQ-2: per-jurisdiction scores
      globalReadiness: 0,           // REQ-2: global readiness score
      simulations: [],              // REQ-3: amendment simulations
      isSimulating: false,          // REQ-3: simulation in progress
      timeline: [],                 // REQ-4: risk timeline events
      payerGaps: [],                // REQ-5: payer evidence gaps
      htaBodyScores: {},            // REQ-5: HTA body scores
      comparisons: [],              // REQ-6: protocol comparisons
      activeComparison: null,       // REQ-6: currently viewed comparison
      isComparing: false,           // REQ-6: comparison in progress
      report: null,                 // REQ-8: generated report
      isGeneratingReport: false,    // REQ-8: report generation in progress
      benchmark: null,              // REQ-10: benchmark results
      isBenchmarking: false,        // REQ-10: benchmark in progress
      guidelines: [],               // REQ-1: ICH guideline database

      setJurisdictionScores: (scores) =>
        set({ jurisdictionScores: scores }, false, 'setJurisdictionScores'),

      setGlobalReadiness: (score) =>
        set({ globalReadiness: score }, false, 'setGlobalReadiness'),

      setSimulations: (sims) =>
        set({ simulations: sims }, false, 'setSimulations'),

      addSimulation: (sim) =>
        set(
          (state) => ({ simulations: [sim, ...state.simulations] }),
          false,
          'addSimulation'
        ),

      setIsSimulating: (bool) =>
        set({ isSimulating: bool }, false, 'setIsSimulating'),

      setTimeline: (events) =>
        set({ timeline: events }, false, 'setTimeline'),

      setPayerGaps: (gaps) =>
        set({ payerGaps: gaps }, false, 'setPayerGaps'),

      setHtaBodyScores: (scores) =>
        set({ htaBodyScores: scores }, false, 'setHtaBodyScores'),

      setComparisons: (cmps) =>
        set({ comparisons: cmps }, false, 'setComparisons'),

      setActiveComparison: (cmp) =>
        set({ activeComparison: cmp }, false, 'setActiveComparison'),

      setIsComparing: (bool) =>
        set({ isComparing: bool }, false, 'setIsComparing'),

      setReport: (report) =>
        set({ report: report }, false, 'setReport'),

      setIsGeneratingReport: (bool) =>
        set({ isGeneratingReport: bool }, false, 'setIsGeneratingReport'),

      setBenchmark: (data) =>
        set({ benchmark: data }, false, 'setBenchmark'),

      setIsBenchmarking: (bool) =>
        set({ isBenchmarking: bool }, false, 'setIsBenchmarking'),

      setGuidelines: (guidelines) =>
        set({ guidelines: guidelines }, false, 'setGuidelines'),

      // ── Strategic Intelligence Setters ───────────────────────────
      setCouncilSession: (data) =>
        set({ councilSession: data }, false, 'setCouncilSession'),
      setIsCouncilLoading: (bool) =>
        set({ isCouncilLoading: bool }, false, 'setIsCouncilLoading'),

      // Async Boardroom Debate state
      activeDebateId: null,
      debateStatus: null,       // full DebateStatusResponse
      isDebatePolling: false,
      debateError: null,
      debateHistory: [],        // previous debate IDs for this doc

      setActiveDebateId: (id) =>
        set({ activeDebateId: id }, false, 'setActiveDebateId'),
      setDebateStatus: (status) =>
        set({ debateStatus: status }, false, 'setDebateStatus'),
      setIsDebatePolling: (bool) =>
        set({ isDebatePolling: bool }, false, 'setIsDebatePolling'),
      setDebateError: (error) =>
        set({ debateError: error }, false, 'setDebateError'),
      setDebateHistory: (history) =>
        set({ debateHistory: history }, false, 'setDebateHistory'),
      clearDebate: () =>
        set({
          activeDebateId: null,
          debateStatus: null,
          isDebatePolling: false,
          debateError: null,
        }, false, 'clearDebate'),

      setFrictionMap: (data) =>
        set({ frictionMap: data }, false, 'setFrictionMap'),
      setIsFrictionLoading: (bool) =>
        set({ isFrictionLoading: bool }, false, 'setIsFrictionLoading'),

      setCostAnalysis: (data) =>
        set({ costAnalysis: data }, false, 'setCostAnalysis'),
      setIsCostLoading: (bool) =>
        set({ isCostLoading: bool }, false, 'setIsCostLoading'),

      setPayerSimulation: (data) =>
        set({ payerSimulation: data }, false, 'setPayerSimulation'),
      setIsPayerSimLoading: (bool) =>
        set({ isPayerSimLoading: bool }, false, 'setIsPayerSimLoading'),

      setSubmissionStrategy: (data) =>
        set({ submissionStrategy: data }, false, 'setSubmissionStrategy'),
      setIsStrategyLoading: (bool) =>
        set({ isStrategyLoading: bool }, false, 'setIsStrategyLoading'),

      setOptimization: (data) =>
        set({ optimization: data }, false, 'setOptimization'),
      setIsOptimizing: (bool) =>
        set({ isOptimizing: bool }, false, 'setIsOptimizing'),

      setInvestorReport: (data) =>
        set({ investorReport: data }, false, 'setInvestorReport'),
      setIsInvestorReportLoading: (bool) =>
        set({ isInvestorReportLoading: bool }, false, 'setIsInvestorReportLoading'),

      setWatchdogAlerts: (data) =>
        set({ watchdogAlerts: data }, false, 'setWatchdogAlerts'),
      setIsWatchdogLoading: (bool) =>
        set({ isWatchdogLoading: bool }, false, 'setIsWatchdogLoading'),

      setClauseLibrary: (data) =>
        set({ clauseLibrary: data }, false, 'setClauseLibrary'),

      setPortfolioRisk: (data) =>
        set({ portfolioRisk: data }, false, 'setPortfolioRisk'),
      setIsPortfolioLoading: (bool) =>
        set({ isPortfolioLoading: bool }, false, 'setIsPortfolioLoading'),

      setCrossProtocol: (data) =>
        set({ crossProtocol: data }, false, 'setCrossProtocol'),

      setActiveView: (view) =>
        set({ activeView: view }, false, 'setActiveView'),

      setActiveTab: (tab) =>
        set({ activeTab: tab }, false, 'setActiveTab'),

      setSidebarExpanded: (bool) =>
        set({ sidebarExpanded: bool }, false, 'setSidebarExpanded'),

      setSelectedSection: (sectionId) =>
        set({ selectedSection: sectionId }, false, 'setSelectedSection'),

      showToast: (notification) =>
        set({ notification, showNotification: true }, false, 'showToast'),

      hideToast: () =>
        set({ showNotification: false }, false, 'hideToast'),

      setIsKbSyncing: (bool) =>
        set({ isKbSyncing: bool }, false, 'setIsKbSyncing'),

      // ============================================================================
      // SELECTORS (Helpers)
      // ============================================================================

      // Get current analysis conflicts (if analyzed)
      getConflicts: () => {
        const { lastAnalysis } = get();
        return lastAnalysis?.findings || [];
      },

      // Check if user is admin (for role-based UI)
      isAdmin: () => {
        const { user } = get();
        return user?.role === 'ADMIN' || user?.groups?.includes('Admin');
      },

      // Get all jobs (active + completed + failed)
      getAllJobs: () => {
        const { activeJobs, completedJobs, failedJobs } = get();
        return [...activeJobs, ...completedJobs, ...failedJobs].sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
      },

      // Reset entire store (for logout)
      reset: () =>
        set(
          {
            user: null,
            isAuthLoading: false,
            isAuthenticated: false,
            authError: null,
            currentDocument: null,
            documents: [],
            isDocumentLoading: false,
            documentError: null,
            isUploading: false,
            uploadProgress: 0,
            lastAnalysis: null,
            isAnalyzing: false,
            analysisError: null,
            analysisHistory: [],
            chatMessages: [],
            isChatLoading: false,
            chatError: null,
            chatConversationId: null,
            activeJobs: [],
            completedJobs: [],
            failedJobs: [],
            jobPollingActive: false,
            jobPollingIntervals: {},
            kbDocuments: [],
            isKbLoading: false,
            kbStats: null,
            activeView: 'protocol',
            activeTab: 'analysis',
            sidebarExpanded: true,
            selectedSection: null,
            showNotification: false,
            notification: null,
            isKbSyncing: false,
            // Regulatory intelligence state
            jurisdictionScores: [],
            globalReadiness: 0,
            simulations: [],
            isSimulating: false,
            timeline: [],
            payerGaps: [],
            htaBodyScores: {},
            comparisons: [],
            activeComparison: null,
            isComparing: false,
            report: null,
            isGeneratingReport: false,
            benchmark: null,
            isBenchmarking: false,
            guidelines: [],
            // Strategic intelligence state
            councilSession: null,
            isCouncilLoading: false,
            // Async boardroom debate state
            activeDebateId: null,
            debateStatus: null,
            isDebatePolling: false,
            debateError: null,
            debateHistory: [],
            frictionMap: null,
            isFrictionLoading: false,
            costAnalysis: null,
            isCostLoading: false,
            payerSimulation: null,
            isPayerSimLoading: false,
            submissionStrategy: null,
            isStrategyLoading: false,
            optimization: null,
            isOptimizing: false,
            investorReport: null,
            isInvestorReportLoading: false,
            watchdogAlerts: null,
            isWatchdogLoading: false,
            clauseLibrary: null,
            portfolioRisk: null,
            isPortfolioLoading: false,
            crossProtocol: null,
          },
          false,
          'reset'
        ),
    }),
    { name: 'NIX-AI-Store' } // DevTools label
  )
);

/**
 * Selector hooks for performance optimization.
 * Use these to subscribe to only relevant slices.
 */

// Auth selectors
export const useAuth = () =>
  useAppStore(useShallow((state) => ({
    user: state.user,
    isAuthLoading: state.isAuthLoading,
    isAuthenticated: state.isAuthenticated,
    isAdmin: state.user?.role === 'ADMIN' || state.user?.groups?.includes('Admin') || false,
  })));

// Document selectors
export const useDocuments = () =>
  useAppStore(useShallow((state) => ({
    currentDocument: state.currentDocument,
    documents: state.documents,
    isLoading: state.isDocumentLoading,
    error: state.documentError,
    isUploading: state.isUploading,
    uploadProgress: state.uploadProgress,
  })));

// Analysis selectors
export const useAnalysis = () =>
  useAppStore(useShallow((state) => ({
    lastAnalysis: state.lastAnalysis,
    isAnalyzing: state.isAnalyzing,
    error: state.analysisError,
    conflicts: state.lastAnalysis?.findings || [],
    history: state.analysisHistory,
  })));

// Chat selectors
export const useChat = () =>
  useAppStore(useShallow((state) => ({
    messages: state.chatMessages,
    isLoading: state.isChatLoading,
    error: state.chatError,
    conversationId: state.chatConversationId,
  })));

// Jobs selectors
export const useJobs = () =>
  useAppStore(useShallow((state) => ({
    activeJobs: state.activeJobs,
    completedJobs: state.completedJobs,
    failedJobs: state.failedJobs,
    allJobs: [...state.activeJobs, ...state.completedJobs, ...state.failedJobs].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    ),
    isPolling: state.jobPollingActive,
  })));

// UI selectors
export const useUI = () =>
  useAppStore(useShallow((state) => ({
    activeView: state.activeView,
    activeTab: state.activeTab,
    sidebarExpanded: state.sidebarExpanded,
    selectedSection: state.selectedSection,
    notification: state.notification,
    showNotification: state.showNotification,
    isKbSyncing: state.isKbSyncing,
  })));

// Knowledge Base selectors (admin)
export const useKB = () =>
  useAppStore(useShallow((state) => ({
    kbDocuments: state.kbDocuments,
    isKbLoading: state.isKbLoading,
    kbStats: state.kbStats,
  })));

// Regulatory Intelligence selectors (REQ-1 through REQ-10)
export const useRegulatory = () =>
  useAppStore(useShallow((state) => ({
    jurisdictionScores: state.jurisdictionScores,
    globalReadiness: state.globalReadiness,
    simulations: state.simulations,
    isSimulating: state.isSimulating,
    timeline: state.timeline,
    payerGaps: state.payerGaps,
    htaBodyScores: state.htaBodyScores,
    comparisons: state.comparisons,
    activeComparison: state.activeComparison,
    isComparing: state.isComparing,
    report: state.report,
    isGeneratingReport: state.isGeneratingReport,
    benchmark: state.benchmark,
    isBenchmarking: state.isBenchmarking,
    guidelines: state.guidelines,
  })));

// Strategic Intelligence selectors (8 killer features)
export const useStrategic = () =>
  useAppStore(useShallow((state) => ({
    councilSession: state.councilSession,
    isCouncilLoading: state.isCouncilLoading,
    // Async boardroom debate
    activeDebateId: state.activeDebateId,
    debateStatus: state.debateStatus,
    isDebatePolling: state.isDebatePolling,
    debateError: state.debateError,
    debateHistory: state.debateHistory,
    frictionMap: state.frictionMap,
    isFrictionLoading: state.isFrictionLoading,
    costAnalysis: state.costAnalysis,
    isCostLoading: state.isCostLoading,
    payerSimulation: state.payerSimulation,
    isPayerSimLoading: state.isPayerSimLoading,
    submissionStrategy: state.submissionStrategy,
    isStrategyLoading: state.isStrategyLoading,
    optimization: state.optimization,
    isOptimizing: state.isOptimizing,
    investorReport: state.investorReport,
    isInvestorReportLoading: state.isInvestorReportLoading,
    watchdogAlerts: state.watchdogAlerts,
    isWatchdogLoading: state.isWatchdogLoading,
    clauseLibrary: state.clauseLibrary,
    portfolioRisk: state.portfolioRisk,
    isPortfolioLoading: state.isPortfolioLoading,
    crossProtocol: state.crossProtocol,
  })));
