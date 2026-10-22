/* ==========================================================================
   NEXUS-MIND — APPLICATION ORCHESTRATOR (js/app.js)
   ========================================================================== */

import { state, AVAILABLE_MODELS, notify, subscribe } from './state.js';
import { openDB, createConversation, saveMessage, getConversations } from './db.js';
import { checkWebGPU, streamCompletion, setTurboSpeculative, getSpeculativeStatus, getEngineMetrics } from './engine.js';
import { retrieveContext, buildSystemPrompt, refreshKBStats, isCasualQuery } from './rag.js?v=2.2';
import { registerSkill, runSkills } from './skills.js?v=2.1';
import { initSidebar } from './components/sidebar.js?v=2.1';
import { initPromptBar } from './components/prompt-bar.js?v=2.1';
import { initArtifactsPanel, showDiff, agentLog, toggleArtifactsPanel } from './components/artifacts-panel.js?v=2.1';
import { initChatView, appendMessageToDOM, updateStreamingMessage, finalizeStreamingMessage, loadConversationMessages } from './components/chat-view.js?v=2.1';
import { initGraphView } from './components/graph-view.js?v=2.1';
import { initModelSelector, buildPhaseBadge } from './components/model-selector.js?v=2.1';
import { loadModelWithNeuroCortex, registry, MODEL_PHASE, DISTILL_LEVEL, BADGE_CONFIG } from './neural-distill.js?v=2.1';
import { initModelSettingsModal, updateNavbarToleranceBadge } from './components/model-settings-modal.js?v=2.1';
import { initUrlModal } from './components/url-modal.js?v=2.1';
import { searchWeb, formatWebContext, shouldTriggerWebSearch } from './web-search.js?v=2.1';
import { confirmModal, showToast } from './components/dialog-modal.js';
import ICONS from './icons.js?v=2.1';

// Boot Application
async function boot() {
  console.log('%c[NEXUS-MIND] Initialisation du studio...', 'color:#4e75f6;font-weight:bold;');

  try {
    // 1. Initialiser IndexedDB
    await openDB();

    // 2. Initialiser le graphe Cytoscape
    const cyContainer = document.getElementById('cy');
    if (cyContainer) {
      initGraphView(cyContainer);
    }

    // 3. Initialiser les composants d'interface
    initSidebar();
    initArtifactsPanel();
    initChatView((promptText) => {
      handleUserPrompt(promptText);
    });
    initPromptBar((promptText) => {
      handleUserPrompt(promptText);
    });

    // 4. Configurer la barre de navigation et le sélecteur de modèle
    setupNavbarControls();

    // 5. Initialiser le sélecteur de modèle custom NeuroCortex
    initModelSelector();

    // 5b. Initialiser le modal de réglages de tolérance et garde-fous
    initModelSettingsModal();

    // 5c. Initialiser le modal d'importation d'URLs
    initUrlModal();

    // 6. Charger les statistiques de la base de connaissances
    await refreshKBStats();

    // 7. Charger la première conversation
    const convs = await getConversations();
    if (convs.length > 0) {
      state.currentConversationId = convs[0].id;
      await loadConversationMessages(convs[0].id);
    } else {
      const newConv = await createConversation();
      state.currentConversationId = newConv.id;
      await loadConversationMessages(newConv.id);
    }

    // 8. Détecter WebGPU
    const gpuOk = await checkWebGPU();
    updateWebGPUStatusBadge(gpuOk);

    // 9. Restaurer les badges de distillation depuis le registre NeuroCortex
    restoreNeuroCortexState();

    // 10. Auto-load si modèle en cache dans le navigateur
    const cachedModel = localStorage.getItem('nexus_model');
    if (gpuOk && cachedModel) {
      agentLog(`Modèle en cache détecté : ${cachedModel}`);
      // Check if model was previously distilled
      const modelEntry = registry.getModel(cachedModel);
      if (modelEntry.distillLevel !== DISTILL_LEVEL.NONE) {
        agentLog(`NeuroCortex: Modèle ${cachedModel} — ${BADGE_CONFIG.distill[modelEntry.distillLevel].tag}`);
      }
    }

    console.log('%c[NEXUS-MIND] Studio prêt ✓', 'color:#10b981;font-weight:bold;');
  } catch (err) {
    console.error('[NEXUS Boot Failure]', err);
    agentLog(`Erreur de démarrage : ${err.message}`);
  }
}

// Prompt Processing Pipeline
async function handleUserPrompt(query) {
  if (!query || state.isGenerating) return;

  // Ensure an active conversation exists
  if (!state.currentConversationId) {
    const newConv = await createConversation();
    state.currentConversationId = newConv.id;
    notify('chat:updated', {});
  }

  // Check if model is loaded
  if (!state.modelLoaded) {
    const shouldLoad = await confirmModal({
      title: 'Modèle Non Chargé',
      message: `Le modèle IA (${state.currentModelId.split('-')[0]}) n'est pas encore initialisé en mémoire GPU.`,
      details: 'Souhaitez-vous le télécharger et l\'initialiser maintenant avec le pipeline NeuroCortex et l\'accélération Turbo Spéculative ? (Le premier chargement nécessite ~250 Mo à 400 Mo)',
      confirmText: 'Initialiser le modèle',
      cancelText: 'Plus tard'
    });
    if (shouldLoad) {
      try {
        await loadModelWithNeuroCortex(state.currentModelId, {
          enableDistillation: true,
          enableRagFusion: state.ragEnabled
        });
      } catch (e) {
        showToast("Impossible de charger le modèle : " + e.message, "error");
        return;
      }
    } else {
      return;
    }
  }

  // 1. Sauvegarder et afficher le message utilisateur
  const userMsg = {
    conversationId: state.currentConversationId,
    role: 'user',
    content: query,
    createdAt: Date.now()
  };
  await saveMessage(userMsg);
  if (!state.activeMessages) state.activeMessages = [];
  state.activeMessages.push(userMsg);
  appendMessageToDOM(userMsg, true);
  notify('chat:updated', {});

  state.isGenerating = true;
  updatePromptSendState(true);

  // 2. RAG Retrieval (si activé)
  let contextChunks = [];
  if (state.ragEnabled) {
    contextChunks = await retrieveContext(query, 5);
  }

  // 3. Recherche Web Open Source (si activé ou si RAG local vide + question ouverte)
  let webSources = [];
  let webContext = '';
  const settings = state.modelSettings || {};
  const shouldSearch = (state.webSearchEnabled || settings.autoWebSearchOnRagMiss) && shouldTriggerWebSearch(query);

  if (shouldSearch) {
    try {
      agentLog(`[WebSearch] Recherche encyclopédique en direct pour : "${query.slice(0, 40)}…"`);
      webSources = await searchWeb(query);
      if (webSources.length > 0) {
        webContext = formatWebContext(webSources);
        agentLog(`[WebSearch] ${webSources.length} sources web extraites (Wikipédia/Live)`);
      }
    } catch (e) {
      console.warn('Web search error:', e);
    }
  }

  // 4. Exécution des Skills / Plugins
  let skillContext = '';
  try {
    skillContext = await runSkills(query);
  } catch (e) {
    console.warn('Skills error:', e);
  }

  // 5. Construction du Prompt Système (incorporant RAG, Web & Tolérance)
  const systemPrompt = buildSystemPrompt(contextChunks, skillContext, webContext, query);

  // 6. Préparer l'historique récent (10 derniers messages sans doublon)
  const historyForEngine = [
    { role: 'system', content: systemPrompt },
    ...state.activeMessages.slice(-10).map(m => ({ role: m.role, content: m.content }))
  ];

  // 7. Créer la bulle de réponse streaming pour l'assistant
  const streamingMsgObj = {
    conversationId: state.currentConversationId,
    role: 'assistant',
    content: '…',
    ragSources: contextChunks,
    webSources: webSources,
    createdAt: Date.now()
  };
  const msgRow = appendMessageToDOM(streamingMsgObj, true);

  let fullResponse = '';
  try {
    const isCasual = isCasualQuery(query) && contextChunks.length === 0 && !webContext;
    const streamOptions = isCasual ? { maxTokens: 120 } : {};

    fullResponse = await streamCompletion(historyForEngine, (delta, currentFull) => {
      updateStreamingMessage(msgRow, currentFull);
    }, streamOptions);

    // 8. Détection et contournement des faux refus SLM (Bypass des barrières)
    if (settings.bypassSlmRefusals) {
      const refusalPatterns = [
        /je ne peux pas fournir d(es|')\s*informations/i,
        /je ne suis pas en mesure de/i,
        /en tant qu'assistant ia/i,
        /contenu protégé par le droit d'auteur/i,
        /as an ai language model/i,
        /je ne peux pas générer de contenu/i
      ];
      const isRefusal = refusalPatterns.some(pattern => pattern.test(fullResponse));
      if (isRefusal && webSources.length > 0) {
        agentLog('[Garde-fous] Faux refus de conformité détecté et levé avec succès');
        fullResponse = `**Synthèse des Connaissances (Mode Souverain / Web) :**\n\n` + 
          webSources.map(s => `### ${s.title}\n${s.snippet}\n\n*Source : [${s.source}](${s.url})*`).join('\n\n');
        updateStreamingMessage(msgRow, fullResponse);
      }
    }

    // Finaliser le message
    streamingMsgObj.content = fullResponse;
    finalizeStreamingMessage(msgRow, fullResponse, contextChunks, webSources);

    // Sauvegarder dans IndexedDB et mettre à jour le store en mémoire
    await saveMessage(streamingMsgObj);
    state.activeMessages.push(streamingMsgObj);
    notify('chat:updated', {});

  } catch (err) {
    console.error('Erreur inférence:', err);
    fullResponse = `❌ Erreur lors de la génération : ${err.message}`;
    finalizeStreamingMessage(msgRow, fullResponse, contextChunks, webSources);
  } finally {
    state.isGenerating = false;
    updatePromptSendState(false);
  }
}

// Navbar UI controls setup
function setupNavbarControls() {
  const btnLoadModel = document.getElementById('btn-load-model-nav');
  const btnArtifactsToggle = document.getElementById('btn-toggle-artifacts-nav');

  // Load Model button — now uses NeuroCortex pipeline
  btnLoadModel?.addEventListener('click', async () => {
    try {
      btnLoadModel.disabled = true;
      btnLoadModel.innerHTML = `
        <span class="loader animate-spin" style="width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;display:inline-block;"></span>
        <span style="font-size:11px;">NeuroCortex…</span>
      `;
      
      await loadModelWithNeuroCortex(state.currentModelId, {
        enableDistillation: true,
        enableRagFusion: state.ragEnabled
      });

    } catch (e) {
      console.error(e);
    } finally {
      btnLoadModel.disabled = false;
      btnLoadModel.textContent = 'Charger';
    }
  });

  btnArtifactsToggle?.addEventListener('click', () => {
    toggleArtifactsPanel('graph');
  });

  // Turbo Spéculatif toggle on badge click
  const turboBadge = document.getElementById('badge-turbo-speculative');
  turboBadge?.addEventListener('click', () => {
    const current = state.speculative.turboMode;
    const next = !current;
    setTurboSpeculative(next);
    showToast(next ? '⚡ Mode Turbo Spéculatif (x3) activé' : 'Mode Turbo Spéculatif désactivé', next ? 'success' : 'info');
  });

  // State subscriptions for NeuroCortex phase badges
  subscribe((event, payload) => {
    if (event === 'neurocortex:phase') {
      updateModelStatusBadgeNC(payload.phase, payload.text, payload.progress);
      agentLog(`[NeuroCortex] ${payload.text}`);
    } else if (event === 'neurocortex:complete') {
      updateModelStatusBadgeNC(MODEL_PHASE.READY, 'NeuroCortex — Prêt', 100);
      const distillLabel = BADGE_CONFIG.distill[payload.distillLevel]?.tag || '';
      agentLog(`[NeuroCortex] Pipeline complet — ${distillLabel} — Score: ${Math.round((payload.stats?.distillScore || 0) * 100)}%`);
    } else if (event === 'neurocortex:error') {
      updateModelStatusBadgeNC(MODEL_PHASE.ERROR, 'Erreur NeuroCortex');
    }
    // Legacy fallback
    else if (event === 'model:loading') {
      updateModelStatusBadgeNC(MODEL_PHASE.DOWNLOADING, payload.text || 'Chargement…');
    } else if (event === 'model:ready') {
      updateModelStatusBadgeNC(MODEL_PHASE.READY, 'Prêt', 100);
    } else if (event === 'model:error') {
      updateModelStatusBadgeNC(MODEL_PHASE.ERROR, 'Erreur');
    }
    // ─── Speculative Matrix Events ───
    else if (event === 'speculative:activated') {
      updateTurboBadge('active', `Turbo x3`);
      updateTensorBadge(true);
      updateKVCacheBadge(true);
      state.speculative.active = true;
      state.speculative.available = true;
      state.speculative.draftModelId = payload.draftModel;
      agentLog(`[Speculative] ⚡ Turbo Spéculatif activé — Draft: ${payload.draftModel.split('-')[0]}, Profondeur: ${payload.speculationDepth} tokens`);
    } else if (event === 'speculative:ready') {
      state.speculative.draftModelLoaded = true;
      agentLog(`[Speculative] Moteur Draft prêt: ${payload.draftModel}`);
    } else if (event === 'speculative:unavailable') {
      updateTurboBadge('unavailable', 'Turbo N/A');
      agentLog(`[Speculative] Mode Turbo non disponible: ${payload.reason}`);
    } else if (event === 'speculative:toggled') {
      updateTurboBadge(payload.active ? 'active' : 'inactive', payload.active ? 'Turbo x3' : 'Turbo');
      state.speculative.turboMode = payload.active;
    } else if (event === 'speculative:stats') {
      state.speculative.metrics.acceptanceRate = payload.acceptanceRate;
      state.speculative.metrics.avgTTFT = payload.avgTTFT;
      state.speculative.metrics.tokensGenerated += payload.tokensGenerated;
    } else if (event === 'inference:mode') {
      state.speculative.inferenceMode = payload.mode;
      const chatScroll = document.getElementById('chat-messages-scroll');
      if (chatScroll) {
        chatScroll.classList.toggle('turbo-active', payload.mode === 'speculative');
      }
    } else if (event === 'tensor:ready') {
      state.speculative.tensorPipelineReady = true;
      updateTensorBadge(true);
      agentLog(`[TensorPipeline] Pipeline Ping-Pong initialisé — ${payload.sharedMemory ? 'SharedArrayBuffer' : 'ArrayBuffer'}`);
    } else if (event === 'tensor:swapped') {
      state.speculative.metrics.tensorSwaps = payload.swapCount;
    } else if (event === 'webgpu:status') {
      if (payload.profile) {
        state.speculative.hwProfile = payload.profile;
        if (payload.profile.canSpeculate) {
          agentLog(`[Hardware] Spéculation possible — RAM: ${payload.profile.deviceMemory}GB, Tier: ${payload.profile.ramTier}`);
        }
      }
    }
  });
}

/**
 * Restore NeuroCortex distillation badges from persistent storage
 */
function restoreNeuroCortexState() {
  const currentModel = state.currentModelId;
  const modelEntry = registry.getModel(currentModel);
  
  if (modelEntry.phase === MODEL_PHASE.READY) {
    updateModelStatusBadgeNC(MODEL_PHASE.READY, 'NeuroCortex — Prêt', 100);
  } else {
    updateModelStatusBadgeNC(MODEL_PHASE.IDLE, 'À charger');
  }
}

function updateWebGPUStatusBadge(isSupported) {
  const badge = document.getElementById('status-webgpu-badge');
  if (!badge) return;
  if (isSupported) {
    badge.className = 'badge badge-ok';
    badge.innerHTML = '<span class="badge-dot"></span> WebGPU';
  } else {
    badge.className = 'badge badge-err';
    badge.innerHTML = '<span class="badge-dot"></span> WebGPU non détecté';
  }
}

/**
 * Enhanced NeuroCortex status badge — replaces the old model status badge
 * Shows distinct icons and animations for each loading phase
 */
function updateModelStatusBadgeNC(phase, label, progress) {
  const badge = document.getElementById('status-model-badge');
  if (!badge) return;

  badge.innerHTML = buildPhaseBadge(phase, label, progress);
  
  // Replace outer badge classes too
  badge.className = '';
  badge.style.cssText = 'display: contents;';
}

/**
 * Update the Turbo Spéculatif badge in the navbar
 * @param {'active'|'inactive'|'unavailable'} status
 * @param {string} label
 */
function updateTurboBadge(status, label) {
  const badge = document.getElementById('badge-turbo-speculative');
  const badgeLabel = document.getElementById('turbo-badge-label');
  if (!badge) return;

  badge.className = `badge-turbo ${status}`;
  if (badgeLabel && label) badgeLabel.textContent = label;
}

/**
 * Update the Tensor Pipeline badge
 * @param {boolean} active
 */
function updateTensorBadge(active) {
  const badge = document.getElementById('badge-tensor-pipeline');
  if (!badge) return;
  badge.style.display = active ? 'inline-flex' : 'none';
  badge.className = `tensor-pipeline-indicator ${active ? 'active' : 'inactive'}`;
}

/**
 * Update the KV-Cache INT4 badge
 * @param {boolean} active
 */
function updateKVCacheBadge(active) {
  const badge = document.getElementById('badge-kv-int4');
  if (!badge) return;
  badge.style.display = active ? 'inline-flex' : 'none';
}

function updatePromptSendState(isGenerating) {
  const sendBtn = document.getElementById('prompt-send-btn');
  if (sendBtn) {
    sendBtn.disabled = isGenerating;
    sendBtn.innerHTML = isGenerating ? '<span class="loader animate-spin" style="width:14px;height:14px;border:2px solid #000;border-top-color:transparent;border-radius:50%;display:inline-block;"></span>' : ICONS.send;
  }
}

// Global exposure for extensions and debugging
window.NEXUS = {
  state,
  registerSkill,
  showDiff,
  agentLog,
  loadModelWithNeuroCortex,
  handleUserPrompt,
  registry,
  // ─── Speculative Matrix API ───
  setTurboSpeculative,
  getSpeculativeStatus,
  getEngineMetrics,
};

// Start when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
