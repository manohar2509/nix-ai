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
      activeView: 'protocol', // 'dashboard' | 'protocol' | 'history' | 'admin-analytics' | 'settings'
      activeTab: 'analysis', // 'analysis' | 'chat' | 'factory' (admin only)
      sidebarExpanded: true,
      selectedSection: null, // Section ID highlighted in EditorWindow
      showNotification: false,
      notification: null, // { type: 'success'|'error'|'info', message }
      isKbSyncing: false, // Knowledge base is updating

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
