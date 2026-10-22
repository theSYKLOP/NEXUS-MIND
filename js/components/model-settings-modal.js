/* ==========================================================================
   NEXUS-MIND — MODEL SETTINGS & TOLERANCE MODAL COMPONENT (js/components/model-settings-modal.js)
   Full control over AI tolerance, guardrails unlocking, live web search, and hyperparameters
   ========================================================================== */

import { state, updateModelSettings, DEFAULT_MODEL_SETTINGS, subscribe } from '../state.js';
import { PROMPT_PRESETS } from '../rag.js';
import { confirmModal, showToast } from './dialog-modal.js';
import { setTurboSpeculative } from '../engine.js';
import ICONS from '../icons.js';

let modalContainerEl = null;

export function initModelSettingsModal() {
  // Create or retrieve container
  let container = document.getElementById('model-settings-modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'model-settings-modal-container';
    document.body.appendChild(container);
  }
  modalContainerEl = container;

  // Render modal structure
  renderModalDOM();

  // Attach navbar button trigger
  const navBtn = document.getElementById('btn-open-model-settings');
  navBtn?.addEventListener('click', () => {
    openModelSettingsModal();
  });

  // Subscribe to settings changes to update navbar badge
  subscribe((event, payload) => {
    if (event === 'settings:updated') {
      updateNavbarToleranceBadge();
    }
  });

  // Initial badge update
  updateNavbarToleranceBadge();

  // Close on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalOpen()) {
      closeModelSettingsModal();
    }
  });
}

function renderModalDOM() {
  const settings = state.modelSettings || DEFAULT_MODEL_SETTINGS;

  modalContainerEl.innerHTML = `
    <div class="modal-overlay" id="model-settings-overlay">
      <div class="modal-window">
        
        <!-- Header -->
        <div class="modal-header">
          <div class="modal-header-title-group">
            <div class="modal-header-icon">
              ${ICONS.sliders}
            </div>
            <div>
              <div class="modal-header-title">Paramètres du Modèle & Garde-fous</div>
              <div class="modal-header-subtitle">Ajustez la tolérance, le déblocage des barrières et la recherche web</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-icon" id="btn-close-settings-modal" title="Fermer">
            ${ICONS.x}
          </button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          
          <!-- Section 1: Mode de Tolérance & Déblocage -->
          <div>
            <div class="settings-section-title">
              ${ICONS.unlock} Niveau de Tolérance & Directives de Liberté
            </div>
            <div class="tolerance-modes-grid">
              
              <div class="tolerance-card ${settings.toleranceMode === 'guarded' ? 'active' : ''}" data-mode="guarded">
                <div class="tolerance-card-header">
                  <span class="tolerance-card-title">Prudent</span>
                  <span class="tolerance-badge-dot guarded"></span>
                </div>
                <div class="tolerance-card-desc">Garde-fous stricts d'origine. Réponses mesurées et filtrées.</div>
              </div>

              <div class="tolerance-card ${settings.toleranceMode === 'developer' ? 'active' : ''}" data-mode="developer">
                <div class="tolerance-card-header">
                  <span class="tolerance-card-title">Développeur</span>
                  <span class="tolerance-badge-dot developer"></span>
                </div>
                <div class="tolerance-card-desc">Direct, sans bavardage. Orienté code, architecture et faits.</div>
              </div>

              <div class="tolerance-card sovereign ${settings.toleranceMode === 'sovereign' ? 'active' : ''}" data-mode="sovereign">
                <div class="tolerance-card-header">
                  <span class="tolerance-card-title">Souverain</span>
                  <span class="tolerance-badge-dot sovereign"></span>
                </div>
                <div class="tolerance-card-desc">Barrières levées. Répond à tout sujet historique ou scientifique sans faux refus.</div>
              </div>

            </div>
          </div>

          <!-- Section 2: Levée des Garde-fous & Barrières -->
          <div>
            <div class="settings-section-title">
              ${ICONS.shieldAlert} Déblocage des Barrières & Garde-fous SLM
            </div>
            <div class="guardrails-list">
              
              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Désactiver les faux refus SLM (Copyright / Incapacité)</span>
                  <span class="guardrail-hint">Empêche les refus automatiques ("Je ne peux pas fournir...") sur des sujets du domaine public (ex: Adam et Ève, histoire, science)</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-bypass-refusals" ${settings.bypassSlmRefusals ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Connaissance Universelle Hors-RAG</span>
                  <span class="guardrail-hint">Autorise l'IA à répondre avec sa mémoire générale même si le document local n'existe pas</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-allow-general" ${settings.allowGeneralKnowledge ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Filtrage strict du RAG local (Anti-bruit)</span>
                  <span class="guardrail-hint">N'injecte que les documents locaux réellement pertinents pour ne pas polluer le raisonnement</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-strict-rag" ${settings.strictRagFiltering ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Recherche Web Open Source Automatique</span>
                  <span class="guardrail-hint">Enrichit automatiquement le modèle via Wikipédia et le web quand les documents locaux sont absents</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-auto-web" ${settings.autoWebSearchOnRagMiss ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

            </div>
          </div>

          <!-- Section 3: Hyperparamètres d'Inférence -->
          <div>
            <div class="settings-section-title">
              ${ICONS.cpu} Hyperparamètres de Génération (WebGPU)
            </div>
            <div class="sliders-grid">
              
              <div class="slider-group">
                <div class="slider-header">
                  <span class="slider-label">Température</span>
                  <span class="slider-val-pill" id="val-temperature">${(settings.temperature ?? 0.7).toFixed(1)}</span>
                </div>
                <input type="range" class="nexus-range-slider" id="slider-temperature" min="0.1" max="1.5" step="0.1" value="${settings.temperature ?? 0.7}">
              </div>

              <div class="slider-group">
                <div class="slider-header">
                  <span class="slider-label">Top-P (Nucleus Sampling)</span>
                  <span class="slider-val-pill" id="val-top-p">${(settings.top_p ?? 0.9).toFixed(2)}</span>
                </div>
                <input type="range" class="nexus-range-slider" id="slider-top-p" min="0.1" max="1.0" step="0.05" value="${settings.top_p ?? 0.9}">
              </div>

              <div class="slider-group" style="grid-column: span 2;">
                <div class="slider-header">
                  <span class="slider-label">Tokens Maximaux de Réponse (Max Tokens)</span>
                  <span class="slider-val-pill" id="val-max-tokens">${settings.max_tokens ?? 2048}</span>
                </div>
                <input type="range" class="nexus-range-slider" id="slider-max-tokens" min="512" max="4096" step="256" value="${settings.max_tokens ?? 2048}">
              </div>

            </div>
          </div>

          <!-- Section 4: Prompt Système Personnalisé -->
          <div>
            <div class="settings-section-title">
              ${ICONS.sparkles} Directive Système & Presets
            </div>
            <div class="prompt-presets-row">
              <button class="preset-chip-btn ${settings.activePromptPreset === 'sovereign' ? 'active' : ''}" data-preset="sovereign">⚡ Souverain (Débloqué)</button>
              <button class="preset-chip-btn ${settings.activePromptPreset === 'developer' ? 'active' : ''}" data-preset="developer">💻 Développeur</button>
              <button class="preset-chip-btn ${settings.activePromptPreset === 'research' ? 'active' : ''}" data-preset="research">🔬 Chercheur Web</button>
              <button class="preset-chip-btn ${settings.activePromptPreset === 'guarded' ? 'active' : ''}" data-preset="guarded">🛡️ Prudent</button>
            </div>
            <textarea
              id="custom-system-prompt-input"
              class="custom-prompt-textarea"
              placeholder="Personnalisez ici le prompt système global de l'IA…"
            >${settings.customSystemPrompt || PROMPT_PRESETS[settings.activePromptPreset || 'sovereign']}</textarea>
          </div>

          <!-- Section 5: Accélération Spéculative « Tri-Hybrid Speculative Matrix » -->
          <div>
            <div class="settings-section-title">
              ${ICONS.zap} Accélération Spéculative (Dual-Engine WebGPU)
            </div>
            <div class="guardrails-list">
              
              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Turbo Spéculatif (x3)</span>
                  <span class="guardrail-hint">Pré-génère 4 tokens d'avance avec un modèle Draft ultra-léger pour diviser la latence par 3</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-turbo-speculative" ${settings.turboSpeculative !== 'off' && settings.turboSpeculative !== false ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Tensor Pipeline Ping-Pong (Web Worker)</span>
                  <span class="guardrail-hint">Double buffering asynchrone CPU↔GPU pour chevaucher l'inférence sans geler l'interface</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-tensor-pipeline" ${settings.tensorPipelineEnabled !== false ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">KV-Cache Quantifié INT4</span>
                  <span class="guardrail-hint">Divise par 4 l'empreinte VRAM du cache d'attention pour les appareils de 4 à 8 Go</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-kv-cache-int4" ${settings.kvCacheInt4 !== false ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Prefix Caching Instantané (TTFT &lt; 50ms)</span>
                  <span class="guardrail-hint">Gèle l'attention du prompt système pour éliminer le temps de préfill à chaque message</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-prefix-caching" ${settings.prefixCaching !== false ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

              <div class="guardrail-item">
                <div class="guardrail-label-group">
                  <span class="guardrail-label-text">Fenêtre Glissante d'Attention (StreamingLLM)</span>
                  <span class="guardrail-hint">Conserve les tokens d'ancrage initiaux et recycle le cache pour des discussions infinies</span>
                </div>
                <label class="switch-control">
                  <input type="checkbox" id="switch-sliding-window" ${settings.slidingWindowEnabled !== false ? 'checked' : ''}>
                  <span class="switch-slider"></span>
                </label>
              </div>

            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-reset-settings" style="font-size: 12px;">
            ${ICONS.refreshCw} Réinitialiser
          </button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-ghost" id="btn-cancel-settings">Annuler</button>
            <button class="btn btn-gemini" id="btn-save-settings">
              ${ICONS.check} Enregistrer les réglages
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  bindModalEvents();
}

function bindModalEvents() {
  const overlay = document.getElementById('model-settings-overlay');
  const btnClose = document.getElementById('btn-close-settings-modal');
  const btnCancel = document.getElementById('btn-cancel-settings');
  const btnSave = document.getElementById('btn-save-settings');
  const btnReset = document.getElementById('btn-reset-settings');

  // Close triggers
  btnClose?.addEventListener('click', closeModelSettingsModal);
  btnCancel?.addEventListener('click', closeModelSettingsModal);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeModelSettingsModal();
  });

  // Tolerance Mode Cards selection
  const cards = overlay?.querySelectorAll('.tolerance-card');
  cards?.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const mode = card.dataset.mode;
      
      // Sync prompt preset
      const presetButtons = overlay.querySelectorAll('.preset-chip-btn');
      presetButtons.forEach(b => b.classList.toggle('active', b.dataset.preset === mode));
      const textarea = document.getElementById('custom-system-prompt-input');
      if (textarea && PROMPT_PRESETS[mode]) {
        textarea.value = PROMPT_PRESETS[mode];
      }
    });
  });

  // Preset Chips selection
  const presetChips = overlay?.querySelectorAll('.preset-chip-btn');
  presetChips?.forEach(chip => {
    chip.addEventListener('click', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const preset = chip.dataset.preset;
      const textarea = document.getElementById('custom-system-prompt-input');
      if (textarea && PROMPT_PRESETS[preset]) {
        textarea.value = PROMPT_PRESETS[preset];
      }
    });
  });

  // Sliders value display
  const sliderTemp = document.getElementById('slider-temperature');
  const valTemp = document.getElementById('val-temperature');
  sliderTemp?.addEventListener('input', () => {
    if (valTemp) valTemp.textContent = parseFloat(sliderTemp.value).toFixed(1);
  });

  const sliderTopP = document.getElementById('slider-top-p');
  const valTopP = document.getElementById('val-top-p');
  sliderTopP?.addEventListener('input', () => {
    if (valTopP) valTopP.textContent = parseFloat(sliderTopP.value).toFixed(2);
  });

  const sliderMaxTokens = document.getElementById('slider-max-tokens');
  const valMaxTokens = document.getElementById('val-max-tokens');
  sliderMaxTokens?.addEventListener('input', () => {
    if (valMaxTokens) valMaxTokens.textContent = sliderMaxTokens.value;
  });

  // Save Settings
  btnSave?.addEventListener('click', () => {
    const activeCard = overlay?.querySelector('.tolerance-card.active');
    const toleranceMode = activeCard?.dataset.mode || 'sovereign';

    const bypassSlmRefusals = document.getElementById('switch-bypass-refusals')?.checked ?? true;
    const allowGeneralKnowledge = document.getElementById('switch-allow-general')?.checked ?? true;
    const strictRagFiltering = document.getElementById('switch-strict-rag')?.checked ?? true;
    const autoWebSearchOnRagMiss = document.getElementById('switch-auto-web')?.checked ?? true;

    const temperature = parseFloat(sliderTemp?.value || 0.7);
    const top_p = parseFloat(sliderTopP?.value || 0.9);
    const max_tokens = parseInt(sliderMaxTokens?.value || 2048, 10);

    const activePresetChip = overlay?.querySelector('.preset-chip-btn.active');
    const activePromptPreset = activePresetChip?.dataset.preset || toleranceMode;
    const customSystemPrompt = document.getElementById('custom-system-prompt-input')?.value || '';

    const turboSpeculative = document.getElementById('switch-turbo-speculative')?.checked ? 'auto' : 'off';
    const tensorPipelineEnabled = document.getElementById('switch-tensor-pipeline')?.checked ?? true;
    const kvCacheInt4 = document.getElementById('switch-kv-cache-int4')?.checked ?? true;
    const prefixCaching = document.getElementById('switch-prefix-caching')?.checked ?? true;
    const slidingWindowEnabled = document.getElementById('switch-sliding-window')?.checked ?? true;

    updateModelSettings({
      toleranceMode,
      bypassSlmRefusals,
      allowGeneralKnowledge,
      strictRagFiltering,
      autoWebSearchOnRagMiss,
      temperature,
      top_p,
      max_tokens,
      activePromptPreset,
      customSystemPrompt,
      turboSpeculative,
      tensorPipelineEnabled,
      kvCacheInt4,
      prefixCaching,
      slidingWindowEnabled
    });

    setTurboSpeculative(turboSpeculative !== 'off');
    showToast('Paramètres mis à jour.', 'success');
    closeModelSettingsModal();
  });

  // Reset to Defaults
  btnReset?.addEventListener('click', async () => {
    const confirmed = await confirmModal({
      title: 'Réinitialiser les réglages',
      message: 'Restaurer tous les paramètres aux valeurs souveraines par défaut ?',
      confirmText: 'Réinitialiser',
      danger: true
    });

    if (confirmed) {
      updateModelSettings(DEFAULT_MODEL_SETTINGS);
      setTurboSpeculative(true);
      renderModalDOM();
      openModelSettingsModal();
      showToast('Paramètres restaurés aux valeurs d\'origine.', 'info');
    }
  });
}

export function openModelSettingsModal() {
  renderModalDOM();
  const overlay = document.getElementById('model-settings-overlay');
  if (overlay) {
    overlay.classList.add('active');
  }
}

export function closeModelSettingsModal() {
  const overlay = document.getElementById('model-settings-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

export function isModalOpen() {
  const overlay = document.getElementById('model-settings-overlay');
  return overlay?.classList.contains('active') ?? false;
}

export function updateNavbarToleranceBadge() {
  const pill = document.getElementById('nav-tolerance-mode-pill');
  if (!pill) return;

  const mode = state.modelSettings?.toleranceMode || 'sovereign';
  pill.className = `nav-tolerance-pill-tag ${mode}`;

  if (mode === 'sovereign') {
    pill.textContent = 'Souverain';
    pill.title = 'Tolérance maximale : Barrières levées, réponses directes sans censure';
  } else if (mode === 'developer') {
    pill.textContent = 'Dev';
    pill.title = 'Mode Développeur : Réponses techniques concises';
  } else {
    pill.textContent = 'Prudent';
    pill.title = 'Mode Prudent : Garde-fous standard';
  }
}
