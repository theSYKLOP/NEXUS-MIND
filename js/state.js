/* ==========================================================================
   NEXUS-MIND — STATE STORE
   ========================================================================== */

export const AVAILABLE_MODELS = [
  // ─── Standard Models ───
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 (0.5B) · Ultra Rapide (~400 Mo)", size: "~400 Mo", rec: true, category: 'standard', draftRole: 'draft' },
  { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", label: "SmolLM2 (360M) · Léger (~250 Mo)", size: "~250 Mo", category: 'standard', draftRole: 'draft' },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 (1.5B) · Équilibré (~1 Go)", size: "~1 Go", category: 'standard' },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 (1B) · Meta (~700 Mo)", size: "~700 Mo", category: 'standard' },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 (3B) · Expert (~2 Go)", size: "~2 Go", category: 'standard' },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi-3.5 Mini · Microsoft (~2.5 Go)", size: "~2.5 Go", category: 'standard' },
  { id: "gemma-2-2b-it-q4f16_1-MLC", label: "Gemma 2 (2B) · Google (~1.5 Go)", size: "~1.5 Go", category: 'standard' },
  // ─── Distilled Models (Axis 3) ───
  { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 Coder (1.5B) · Distillé Code (~900 Mo)", size: "~900 Mo", category: 'distilled', tags: ['code', 'distilled'], ramProfile: '4GB' },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 (3B) · Expert Distillé (~1.8 Go)", size: "~1.8 Go", category: 'distilled', tags: ['general', 'distilled'], ramProfile: '8GB' },
];

export const DEFAULT_MODEL_SETTINGS = {
  // Mode de tolérance : 'sovereign' (Tolérance Max / Débloqué) | 'developer' (Analytique) | 'guarded' (Prudent)
  toleranceMode: 'sovereign',
  
  // Barrières & Garde-fous
  bypassSlmRefusals: true,
  allowGeneralKnowledge: true,
  strictRagFiltering: true,
  ragRelevanceThreshold: 0.25,

  // Recherche Web Open Source
  webSearchEnabled: true,
  autoWebSearchOnRagMiss: true,

  // Hyperparamètres d'inférence
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 2048,

  // Prompt système & presets
  activePromptPreset: 'sovereign',
  customSystemPrompt: '',

  // ─── Tri-Hybrid Speculative Matrix ───
  // Turbo Spéculatif : active la prédiction de tokens par le modèle Draft
  turboSpeculative: 'auto',  // 'auto' | 'on' | 'off'
  // Tensor Pipeline : active le double buffering CPU↔GPU
  tensorPipelineEnabled: true,
  // KV-Cache INT4 : quantification INT4 du cache d'attention
  kvCacheInt4: true,
  // Prefix Caching : gel du prompt système pour TTFT < 50ms
  prefixCaching: true,
  // Sliding Window : fenêtre glissante d'attention pour les longues conversations
  slidingWindowEnabled: true,
};

function loadStoredSettings() {
  try {
    const raw = localStorage.getItem('nexus_model_settings');
    if (raw) {
      return { ...DEFAULT_MODEL_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to parse stored model settings:', e);
  }
  return { ...DEFAULT_MODEL_SETTINGS };
}

export const state = {
  // WebGPU & AI Engine
  webgpuSupported: false,
  modelLoaded: false,
  modelLoading: false,
  modelProgress: 0,
  modelStatusText: 'Non chargé',
  currentModelId: localStorage.getItem('nexus_model') || AVAILABLE_MODELS[0].id,
  engine: null,

  // Model Parameters & Tolerance Guardrails
  modelSettings: loadStoredSettings(),

  // Sessions & Chat
  conversations: [],
  currentConversationId: null,
  activeMessages: [],
  isGenerating: false,
  ragEnabled: true,
  webSearchEnabled: loadStoredSettings().webSearchEnabled ?? true,

  // Knowledge & Sandbox
  fsHandle: null,
  graph: null,
  kbStats: { docsCount: 0, chunksCount: 0 },

  // UI States
  sidebarOpen: window.innerWidth > 900,
  artifactsOpen: false,
  artifactsMaximized: false,
  activeArtifactTab: 'graph', // 'graph' | 'sandbox' | 'kb' | 'skills'

  // ─── Tri-Hybrid Speculative Matrix State ───
  speculative: {
    active: false,           // Whether speculative decoding is currently active
    available: false,        // Whether hardware supports speculation
    draftModelId: null,      // Currently loaded draft model
    draftModelLoaded: false, // Draft engine loaded & ready
    turboMode: false,        // User-toggled turbo mode
    inferenceMode: 'standard', // 'standard' | 'speculative'
    hwProfile: null,         // Detected hardware profile
    tensorPipelineReady: false, // Tensor worker initialized
    prefixCacheEntries: 0,   // Number of cached system prompts
    metrics: {
      acceptanceRate: 0,
      avgTTFT: 0,
      tokensGenerated: 0,
      tensorSwaps: 0,
    },
  },
};

export function updateModelSettings(partialSettings) {
  state.modelSettings = { ...state.modelSettings, ...partialSettings };
  if (partialSettings.webSearchEnabled !== undefined) {
    state.webSearchEnabled = partialSettings.webSearchEnabled;
  }
  try {
    localStorage.setItem('nexus_model_settings', JSON.stringify(state.modelSettings));
  } catch (e) {
    console.error('Failed to save model settings:', e);
  }
  notify('settings:updated', state.modelSettings);
}

// Simple Observer Pattern for State Change Notifications
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(event, payload) {
  listeners.forEach(fn => fn(event, payload, state));
}
