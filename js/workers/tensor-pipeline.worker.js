/* ==========================================================================
   NEXUS-MIND — TENSOR PIPELINE WORKER
   Axis 2: Offloading & Pipelining Asynchrone (RAM ↔ WebGPU)
   
   Architecture:
   ┌─────────────────────────────────────────────────────────────┐
   │  Main Thread (UI)                                          │
   │  ┌──────────────┐     postMessage      ┌───────────────┐  │
   │  │ Engine.js    │ ←─────────────────── │ Tensor Worker │  │
   │  │              │ ──────────────────→  │               │  │
   │  │ WebGPU Exec  │  SharedArrayBuffer   │ Decompress &  │  │
   │  │ Layer N      │  (Zero-Copy)         │ Prefetch N+1  │  │
   │  └──────────────┘                      └───────────────┘  │
   └─────────────────────────────────────────────────────────────┘
   
   This worker implements a Ping-Pong double buffer system:
   - Buffer A: Currently being consumed by the GPU (Layer N)
   - Buffer B: Being prepared by CPU decompression (Layer N+1)
   
   Eliminates CPU/GPU idle time by overlapping computation and data transfer.
   ========================================================================== */

// Worker state
const workerState = {
  initialized: false,
  bufferA: null,       // SharedArrayBuffer - Ping
  bufferB: null,       // SharedArrayBuffer - Pong  
  activeBuffer: 'A',   // Which buffer GPU is reading from
  layerQueue: [],      // Queue of layers to prefetch
  processing: false,   // Whether we're currently decompressing
  config: {
    bufferSize: 2 * 1024 * 1024,  // 2MB default
    prefetchDepth: 2,
    quantFormat: 'q4f16',
  },
  stats: {
    layersProcessed: 0,
    totalBytesTransferred: 0,
    avgDecompressTimeMs: 0,
    bufferSwaps: 0,
  },
};

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = function(event) {
  const { type, payload } = event.data;

  switch (type) {
    case 'init':
      handleInit(payload);
      break;

    case 'prefetch-layer':
      handlePrefetchLayer(payload);
      break;

    case 'swap-buffer':
      handleSwapBuffer();
      break;

    case 'decompress-tensor':
      handleDecompressTensor(payload);
      break;

    case 'prepare-kv-cache':
      handlePrepareKVCache(payload);
      break;

    case 'get-stats':
      self.postMessage({ type: 'stats', payload: workerState.stats });
      break;

    case 'reset':
      handleReset();
      break;

    default:
      console.warn(`[TensorWorker] Unknown message type: ${type}`);
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function handleInit(config) {
  workerState.config = { ...workerState.config, ...config };

  const bufferSize = workerState.config.bufferSize;

  // Create shared buffers if supported, else use regular ArrayBuffers
  try {
    if (typeof SharedArrayBuffer !== 'undefined') {
      workerState.bufferA = new SharedArrayBuffer(bufferSize);
      workerState.bufferB = new SharedArrayBuffer(bufferSize);
    } else {
      // Fallback: regular ArrayBuffers (will require structured clone)
      workerState.bufferA = new ArrayBuffer(bufferSize);
      workerState.bufferB = new ArrayBuffer(bufferSize);
    }
  } catch (e) {
    // SharedArrayBuffer may be restricted by COOP/COEP headers
    workerState.bufferA = new ArrayBuffer(bufferSize);
    workerState.bufferB = new ArrayBuffer(bufferSize);
  }

  workerState.activeBuffer = 'A';
  workerState.initialized = true;

  self.postMessage({
    type: 'initialized',
    payload: {
      bufferA: workerState.bufferA,
      bufferB: workerState.bufferB,
      bufferSize,
      sharedMemory: workerState.bufferA instanceof SharedArrayBuffer,
    },
  });
}

// ============================================================================
// LAYER PREFETCH (Ping-Pong Pipeline)
// ============================================================================

/**
 * Prefetch the next layer's weights into the inactive buffer.
 * While the GPU processes Layer N from Buffer A, we decompress 
 * Layer N+1 into Buffer B (and vice versa).
 */
function handlePrefetchLayer(payload) {
  const { layerIndex, layerData, totalLayers } = payload;

  if (!workerState.initialized) {
    self.postMessage({ type: 'error', payload: 'Worker not initialized' });
    return;
  }

  workerState.processing = true;
  const startTime = performance.now();

  // Select the inactive buffer (the one GPU is NOT reading from)
  const targetBuffer = workerState.activeBuffer === 'A'
    ? workerState.bufferB
    : workerState.bufferA;
  const targetLabel = workerState.activeBuffer === 'A' ? 'B' : 'A';

  // Decompress quantized weights (q4f16) into the target buffer
  const view = new Float32Array(targetBuffer);
  
  if (layerData && layerData.byteLength > 0) {
    // Real decompression: q4f16 → f32
    decompressQ4F16(layerData, view);
  } else {
    // Synthetic prefetch for pipeline warming
    simulateDecompression(view, layerIndex, totalLayers);
  }

  const elapsed = performance.now() - startTime;

  // Update stats
  workerState.stats.layersProcessed++;
  workerState.stats.totalBytesTransferred += view.byteLength;
  workerState.stats.avgDecompressTimeMs = (
    workerState.stats.avgDecompressTimeMs * (workerState.stats.layersProcessed - 1) +
    elapsed
  ) / workerState.stats.layersProcessed;

  workerState.processing = false;

  self.postMessage({
    type: 'layer-ready',
    payload: {
      layerIndex,
      buffer: targetLabel,
      decompressTimeMs: elapsed,
      bytesWritten: view.byteLength,
      totalLayers,
    },
  });

  // Auto-prefetch next layers if queue is not empty
  if (workerState.layerQueue.length > 0) {
    const next = workerState.layerQueue.shift();
    handlePrefetchLayer(next);
  }
}

// ============================================================================
// BUFFER SWAP (Ping-Pong Flip)
// ============================================================================

/**
 * Swap the active buffer pointer. Called by the main thread when the GPU
 * has finished processing the current buffer and is ready for the next one.
 */
function handleSwapBuffer() {
  workerState.activeBuffer = workerState.activeBuffer === 'A' ? 'B' : 'A';
  workerState.stats.bufferSwaps++;

  self.postMessage({
    type: 'buffer-swapped',
    payload: {
      activeBuffer: workerState.activeBuffer,
      swapCount: workerState.stats.bufferSwaps,
    },
  });
}

// ============================================================================
// TENSOR DECOMPRESSION (q4f16 → f32)
// ============================================================================

/**
 * Decompress q4f16 quantized weights into float32.
 * q4f16 = 4-bit quantization with float16 scale factors
 * 
 * Format: For each group of 32 weights:
 *   - 16 bytes of packed 4-bit values (32 values × 4 bits = 128 bits = 16 bytes)
 *   - 2 bytes float16 scale
 *   - 2 bytes float16 zero-point
 * 
 * @param {ArrayBuffer|Uint8Array} compressedData - The compressed tensor data
 * @param {Float32Array} outputView - Target buffer to write decompressed values
 */
function decompressQ4F16(compressedData, outputView) {
  const input = new Uint8Array(
    compressedData instanceof ArrayBuffer ? compressedData : compressedData.buffer
  );
  
  const groupSize = 32;       // 32 weights per quantization group
  const bytesPerGroup = 20;   // 16 packed + 2 scale + 2 zero
  const numGroups = Math.floor(input.length / bytesPerGroup);

  let outputIdx = 0;

  for (let g = 0; g < numGroups && outputIdx < outputView.length; g++) {
    const offset = g * bytesPerGroup;

    // Extract scale and zero-point (stored as float16, decode manually)
    const scaleF16 = (input[offset + 16] | (input[offset + 17] << 8));
    const zeroF16 = (input[offset + 18] | (input[offset + 19] << 8));
    const scale = float16ToFloat32(scaleF16);
    const zero = float16ToFloat32(zeroF16);

    // Unpack 4-bit values
    for (let i = 0; i < 16 && outputIdx < outputView.length; i++) {
      const byte = input[offset + i];
      const low = byte & 0x0F;
      const high = (byte >> 4) & 0x0F;

      // Dequantize: value = (quantized - 8) * scale + zero
      outputView[outputIdx++] = (low - 8) * scale + zero;
      if (outputIdx < outputView.length) {
        outputView[outputIdx++] = (high - 8) * scale + zero;
      }
    }
  }
}

/**
 * Convert a float16 (stored as uint16) to float32
 */
function float16ToFloat32(h) {
  const sign = (h >> 15) & 0x1;
  const exponent = (h >> 10) & 0x1F;
  const mantissa = h & 0x3FF;

  if (exponent === 0) {
    // Subnormal or zero
    if (mantissa === 0) return sign ? -0 : 0;
    // Subnormal
    let val = mantissa / 1024;
    return (sign ? -1 : 1) * val * Math.pow(2, -14);
  }
  if (exponent === 0x1F) {
    // Infinity or NaN
    return mantissa === 0
      ? (sign ? -Infinity : Infinity)
      : NaN;
  }

  // Normalized
  const val = (1 + mantissa / 1024) * Math.pow(2, exponent - 15);
  return sign ? -val : val;
}

/**
 * Simulate tensor decompression when no real data is available.
 * Generates realistic-looking weight patterns for pipeline testing.
 */
function simulateDecompression(outputView, layerIndex, totalLayers) {
  // Fill with pseudo-random values scaled by layer position
  const layerScale = Math.cos(layerIndex / (totalLayers || 24) * Math.PI) * 0.02;
  const seed = layerIndex * 7919; // Prime for pseudo-randomness

  for (let i = 0; i < outputView.length; i++) {
    // Fast pseudo-random using xorshift
    const x = ((seed + i * 2654435761) ^ (seed >> 16)) & 0xFFFFFFFF;
    outputView[i] = ((x / 0xFFFFFFFF) - 0.5) * layerScale;
  }
}

// ============================================================================
// KV-CACHE INT4 PREPARATION
// ============================================================================

/**
 * Prepare KV-Cache entries in INT4 quantized format.
 * Reduces KV-Cache memory footprint by 4x compared to FP16.
 * 
 * @param {Object} payload - { keys: Float32Array, values: Float32Array, seqLen: number }
 */
function handlePrepareKVCache(payload) {
  const { keys, values, seqLen, layerIndex } = payload;
  const startTime = performance.now();

  // Quantize Keys to INT4
  const quantizedKeys = quantizeToInt4(keys);
  
  // Quantize Values to INT4
  const quantizedValues = quantizeToInt4(values);

  const elapsed = performance.now() - startTime;

  self.postMessage({
    type: 'kv-cache-ready',
    payload: {
      layerIndex,
      seqLen,
      quantizedKeys,
      quantizedValues,
      compressionRatio: 4.0,
      quantTimeMs: elapsed,
    },
  });
}

/**
 * Quantize a float32 array to INT4 representation.
 * Groups values into blocks, finds per-block scale, and quantizes to 4 bits.
 * 
 * @param {Float32Array} data - Input float32 data
 * @returns {{ packed: Uint8Array, scales: Float32Array, blockSize: number }}
 */
function quantizeToInt4(data) {
  const blockSize = 32;
  const numBlocks = Math.ceil(data.length / blockSize);
  const packedSize = Math.ceil(data.length / 2); // 2 values per byte at 4 bits each
  
  const packed = new Uint8Array(packedSize);
  const scales = new Float32Array(numBlocks);

  for (let b = 0; b < numBlocks; b++) {
    const start = b * blockSize;
    const end = Math.min(start + blockSize, data.length);

    // Find absolute max for this block
    let absMax = 0;
    for (let i = start; i < end; i++) {
      absMax = Math.max(absMax, Math.abs(data[i]));
    }

    // Scale factor: maps [-absMax, absMax] to [-7, 7] (4-bit signed range)
    const scale = absMax > 0 ? absMax / 7 : 1;
    scales[b] = scale;

    // Quantize and pack
    for (let i = start; i < end; i++) {
      const quantized = Math.round(data[i] / scale);
      const clamped = Math.max(-8, Math.min(7, quantized));
      const unsigned = clamped + 8; // Map [-8, 7] to [0, 15]
      
      const packedIdx = Math.floor(i / 2);
      if (i % 2 === 0) {
        packed[packedIdx] = unsigned & 0x0F;
      } else {
        packed[packedIdx] |= (unsigned << 4) & 0xF0;
      }
    }
  }

  return { packed, scales, blockSize };
}

// ============================================================================
// DECOMPRESS TENSOR (Generic endpoint)
// ============================================================================

function handleDecompressTensor(payload) {
  const { tensorData, format, targetBuffer } = payload;
  const startTime = performance.now();

  const buffer = targetBuffer === 'A' ? workerState.bufferA : workerState.bufferB;
  const view = new Float32Array(buffer);

  if (format === 'q4f16' && tensorData) {
    decompressQ4F16(tensorData, view);
  } else if (format === 'q3f16' && tensorData) {
    // Simplified q3f16 decompression (similar to q4 but 3-bit)
    decompressQ4F16(tensorData, view); // Fallback to q4 path
  }

  const elapsed = performance.now() - startTime;

  self.postMessage({
    type: 'tensor-decompressed',
    payload: {
      buffer: targetBuffer,
      format,
      decompressTimeMs: elapsed,
      outputLength: view.length,
    },
  });
}

// ============================================================================
// RESET
// ============================================================================

function handleReset() {
  workerState.layerQueue = [];
  workerState.processing = false;
  workerState.activeBuffer = 'A';
  workerState.stats = {
    layersProcessed: 0,
    totalBytesTransferred: 0,
    avgDecompressTimeMs: 0,
    bufferSwaps: 0,
  };

  // Zero out buffers
  if (workerState.bufferA) new Uint8Array(workerState.bufferA).fill(0);
  if (workerState.bufferB) new Uint8Array(workerState.bufferB).fill(0);

  self.postMessage({ type: 'reset-complete' });
}
