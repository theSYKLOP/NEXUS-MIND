/* ==========================================================================
   NEXUS-MIND — TRI-HYBRID SPECULATIVE MATRIX — CONFIGURATION
   
   Central configuration for the speculative inference acceleration system.
   Defines: Draft/Target model pairings, MoE profiles, KV-Cache INT4 config,
   Prefix Caching thresholds, and hardware capability detection.
   ========================================================================== */

// ============================================================================
// DRAFT MODEL PAIRINGS (Speculative Decoding)
// Maps each target model to its optimal draft model for token speculation
// ============================================================================

export const DRAFT_MODEL_PAIRINGS = {
  // Target Model ID → Draft Model ID
  'gemma-2-2b-it-q4f16_1-MLC':         'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC': 'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC': 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': 'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': 'SmolLM2-360M-Instruct-q4f16_1-MLC',
};

// Models small enough that draft speculation gives no benefit
export const DRAFT_EXEMPT_MODELS = new Set([
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'SmolLM2-360M-Instruct-q4f16_1-MLC',
]);

// ============================================================================
// SPECULATIVE DECODING PARAMETERS
// ============================================================================

export const SPECULATIVE_CONFIG = {
  // Number of tokens the draft model predicts ahead
  speculationDepth: 4,

  // Minimum acceptance probability to keep a drafted token
  acceptanceThreshold: 0.7,

  // Maximum retries before falling back to standard autoregressive
  maxRejectionsBeforeFallback: 3,

  // Enable parallel batch verification of drafted tokens on target
  parallelVerification: true,

  // Enable automatic fallback to standard decoding when acceptance rate drops
  adaptiveFallback: true,

  // Minimum acceptance rate over the last N tokens to keep speculative mode active
  minAcceptanceRate: 0.5,
  acceptanceWindowSize: 20,
};

// ============================================================================
// KV-CACHE INT4 CONFIGURATION
// ============================================================================

export const KV_CACHE_CONFIG = {
  // Quantization level for the KV-Cache (INT4 = 4x memory reduction)
  quantization: 'int4',

  // Maximum KV-Cache entries before eviction
  maxEntries: {
    '4GB': 512,
    '8GB': 1024,
    '16GB': 2048,
  },

  // Eviction strategy: 'lru' | 'sliding_window' | 'hybrid'
  evictionStrategy: 'hybrid',

  // Sliding window size for StreamingLLM attention pattern
  slidingWindowSize: 2048,

  // Number of initial tokens to always keep (system prompt / prefix cache)
  sinkTokens: 64,

  // Enable INT4 quantized storage of Key and Value tensors
  enableInt4Storage: true,
};

// ============================================================================
// PREFIX CACHING (System Prompt Freeze)
// ============================================================================

export const PREFIX_CACHE_CONFIG = {
  // Enable freezing of system prompt attention computation
  enabled: true,

  // Maximum prefix length to cache (in tokens)
  maxPrefixLength: 512,

  // TTFT target in milliseconds
  ttftTargetMs: 50,

  // Pre-compute and cache attention for these prompt presets
  cacheablePresets: ['sovereign', 'developer', 'research', 'guarded'],

  // Invalidate prefix cache when system prompt changes
  invalidateOnPromptChange: true,
};

// ============================================================================
// MoE (MIXTURE OF EXPERTS) ROUTING CONFIGURATION
// ============================================================================

export const MOE_CONFIG = {
  // Number of experts to activate per token (out of total experts)
  activeExperts: 2,

  // Load balancing loss weight (prevents expert collapse)
  loadBalancingWeight: 0.01,

  // Expert capacity factor (limits max tokens per expert)
  capacityFactor: 1.25,

  // Enable dynamic routing based on token difficulty
  dynamicRouting: true,

  // Batch routing: group tokens for more efficient expert dispatch
  batchRouting: true,
};

// ============================================================================
// EXTENDED MODEL PROFILES (Distilled & MoE models)
// ============================================================================

export const EXTENDED_MODEL_PROFILES = [
  {
    id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 Coder (1.5B) · Distillé Code',
    size: '~900 Mo',
    category: 'distilled',
    draftModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    ramProfile: '4GB',
    moe: false,
    tags: ['code', 'distilled'],
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 (3B) · Expert Distillé',
    size: '~1.8 Go',
    category: 'distilled',
    draftModel: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    ramProfile: '8GB',
    moe: false,
    tags: ['general', 'distilled'],
  },
];

// ============================================================================
// TENSOR PIPELINE WORKER CONFIGURATION
// ============================================================================

export const TENSOR_PIPELINE_CONFIG = {
  // Double buffering (Ping-Pong) for CPU→GPU tensor transfer
  enablePingPong: true,

  // Size of each transfer buffer in bytes (2MB per buffer)
  bufferSizeBytes: 2 * 1024 * 1024,

  // Maximum layers to prefetch ahead
  prefetchDepth: 2,

  // Enable SharedArrayBuffer for zero-copy worker communication
  enableSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',

  // Decompression format for quantized weights
  decompressFormat: 'q4f16',

  // Worker pool size (for multi-layer parallel prefetch)
  workerPoolSize: 1,
};

// ============================================================================
// HARDWARE CAPABILITY DETECTION
// ============================================================================

/**
 * Detect system capabilities and return optimal configuration
 * @returns {Object} Hardware profile with recommended settings
 */
export function detectHardwareProfile() {
  const deviceMemory = navigator.deviceMemory || 4; // GB, defaults to 4
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  // Determine RAM tier
  let ramTier;
  if (deviceMemory <= 4) ramTier = '4GB';
  else if (deviceMemory <= 8) ramTier = '8GB';
  else ramTier = '16GB';

  // Determine if speculative decoding is feasible
  const canSpeculate = deviceMemory >= 6 && hardwareConcurrency >= 4 && !isMobile;

  // Determine optimal KV-Cache slots
  const kvCacheSlots = KV_CACHE_CONFIG.maxEntries[ramTier] || 512;

  // Determine optimal sliding window
  const slidingWindow = isMobile ? 1024 : KV_CACHE_CONFIG.slidingWindowSize;

  // Determine optimal speculation depth
  const speculationDepth = canSpeculate ? SPECULATIVE_CONFIG.speculationDepth : 0;

  return {
    deviceMemory,
    hardwareConcurrency,
    isMobile,
    hasSharedArrayBuffer,
    ramTier,
    canSpeculate,
    kvCacheSlots,
    slidingWindow,
    speculationDepth,
    recommendedMaxTokens: isMobile ? 1024 : 2048,
    tensorPipeline: {
      enabled: hasSharedArrayBuffer && hardwareConcurrency >= 2,
      bufferSize: isMobile
        ? TENSOR_PIPELINE_CONFIG.bufferSizeBytes / 2
        : TENSOR_PIPELINE_CONFIG.bufferSizeBytes,
      prefetchDepth: isMobile ? 1 : TENSOR_PIPELINE_CONFIG.prefetchDepth,
    },
  };
}

/**
 * Get the optimal engine configuration for a given model and hardware profile
 * @param {string} targetModelId - The target model to configure
 * @param {Object} hwProfile - Output from detectHardwareProfile()
 * @returns {Object} Engine initialization config for WebLLM
 */
export function getEngineConfig(targetModelId, hwProfile) {
  const config = {
    logLevel: 'WARN',

    // KV-Cache INT4 quantization
    kvCacheQuantization: KV_CACHE_CONFIG.enableInt4Storage ? 'int4' : 'none',
    kvCacheMaxEntries: hwProfile.kvCacheSlots,

    // Sliding Window Attention (StreamingLLM)
    slidingWindowSize: hwProfile.slidingWindow,
    sinkTokens: KV_CACHE_CONFIG.sinkTokens,

    // Prefix Caching
    prefixCacheEnabled: PREFIX_CACHE_CONFIG.enabled,
    prefixCacheMaxLength: PREFIX_CACHE_CONFIG.maxPrefixLength,
  };

  return config;
}

/**
 * Check if a model supports speculative decoding with a draft model
 * @param {string} modelId - The target model ID
 * @returns {{ canSpeculate: boolean, draftModelId: string|null }}
 */
export function getSpeculativePairing(modelId) {
  if (DRAFT_EXEMPT_MODELS.has(modelId)) {
    return { canSpeculate: false, draftModelId: null };
  }

  const draftModelId = DRAFT_MODEL_PAIRINGS[modelId] || null;

  // Also check extended profiles
  if (!draftModelId) {
    const profile = EXTENDED_MODEL_PROFILES.find(p => p.id === modelId);
    if (profile?.draftModel) {
      return { canSpeculate: true, draftModelId: profile.draftModel };
    }
  }

  return {
    canSpeculate: !!draftModelId,
    draftModelId,
  };
}
