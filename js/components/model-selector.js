/* ==========================================================================
   NEXUS-MIND — CUSTOM MODEL SELECTOR DROPDOWN
   Rich dropdown with distillation badges, phase indicators, and NeuroCortex status
   ========================================================================== */

import { state, AVAILABLE_MODELS, notify, subscribe } from '../state.js';
import { registry, BADGE_CONFIG, DISTILL_LEVEL, MODEL_PHASE } from '../neural-distill.js';
import ICONS from '../icons.js';

let dropdownOpen = false;
let wrapperEl = null;
let dropdownEl = null;
let selectedDisplayEl = null;
let closeHandler = null;

/**
 * SVG icon fragments for inline badges
 */
const BADGE_ICONS = {
  download: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  package: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  compress: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m9.2 22 3-7"/><path d="m12.8 22-3-7"/></svg>`,
  brain: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>`,
  zap: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  check: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  shield: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
  sparkles: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

/**
 * Get distill badge HTML for a model
 */
function getDistillBadgeHTML(modelId) {
  const level = registry.getDistillLevel(modelId);
  const config = BADGE_CONFIG.distill[level];
  if (!config || level === DISTILL_LEVEL.NONE) return '';

  return `<span class="model-distill-badge ${config.color}" title="${config.tag}">
    ${config.label}
  </span>`;
}

/**
 * Get phase badge HTML for a model (live loading status)
 */
function getPhaseIconSVG(phase) {
  const map = {
    [MODEL_PHASE.DOWNLOADING]: BADGE_ICONS.download,
    [MODEL_PHASE.INSTALLING]:  BADGE_ICONS.package,
    [MODEL_PHASE.QUANTIZING]:  BADGE_ICONS.compress,
    [MODEL_PHASE.DISTILLING]:  BADGE_ICONS.brain,
    [MODEL_PHASE.OPTIMIZING]:  BADGE_ICONS.zap,
    [MODEL_PHASE.READY]:       BADGE_ICONS.check,
    [MODEL_PHASE.ERROR]:       BADGE_ICONS.alert,
  };
  return map[phase] || '';
}

/**
 * Initialize the custom model selector, replacing the native <select>
 */
export function initModelSelector() {
  const nativeSelect = document.getElementById('navbar-model-select');
  const selectorWrapper = document.querySelector('.model-selector-wrapper');
  if (!selectorWrapper || !nativeSelect) return;

  // Hide native select
  nativeSelect.style.display = 'none';

  // Build custom dropdown structure
  wrapperEl = selectorWrapper;
  wrapperEl.classList.add('model-selector-custom');

  // Selected display
  selectedDisplayEl = document.createElement('div');
  selectedDisplayEl.className = 'model-selected-display';
  selectedDisplayEl.innerHTML = buildSelectedDisplay(state.currentModelId);
  wrapperEl.appendChild(selectedDisplayEl);

  // Chevron
  const chevron = document.createElement('span');
  chevron.className = 'model-selector-chevron';
  chevron.innerHTML = BADGE_ICONS.chevronDown;
  wrapperEl.appendChild(chevron);

  // Dropdown panel
  dropdownEl = document.createElement('div');
  dropdownEl.className = 'model-dropdown-panel';
  dropdownEl.innerHTML = buildDropdownItems();
  wrapperEl.appendChild(dropdownEl);

  // Toggle dropdown
  wrapperEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Close on outside click
  closeHandler = (e) => {
    if (!wrapperEl.contains(e.target)) {
      closeDropdown();
    }
  };
  document.addEventListener('click', closeHandler);

  // Subscribe to NeuroCortex events for live badge updates
  subscribe((event, payload) => {
    if (event === 'neurocortex:phase' || event === 'neurocortex:complete' || event === 'model:ready') {
      refreshSelector();
    }
  });
}

function buildSelectedDisplay(modelId) {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId) || AVAILABLE_MODELS[0];
  const distillBadge = getDistillBadgeHTML(modelId);
  const shortLabel = model.label.split('·')[0].trim();
  
  return `
    <span class="model-selected-label">${shortLabel}</span>
    ${distillBadge}
  `;
}

function buildDropdownItems() {
  return AVAILABLE_MODELS.map(model => {
    const isSelected = model.id === state.currentModelId;
    const regModel = registry.getModel(model.id);
    const distillLevel = regModel.distillLevel;
    const distillConfig = BADGE_CONFIG.distill[distillLevel];
    const isDistilled = distillLevel !== DISTILL_LEVEL.NONE;
    const phase = regModel.phase;

    // Build status indicator
    let statusIndicator = '';
    if (phase === MODEL_PHASE.READY) {
      statusIndicator = `<span class="model-item-status ready">${BADGE_ICONS.check} Chargé</span>`;
    } else if (phase !== MODEL_PHASE.IDLE) {
      const phaseConfig = BADGE_CONFIG.phases[phase];
      statusIndicator = `<span class="model-item-status loading">${getPhaseIconSVG(phase)} ${phaseConfig.label}…</span>`;
    }

    // Build distill badges
    let distillBadges = '';
    if (isDistilled) {
      distillBadges = `<span class="model-distill-badge ${distillConfig.color}" title="${distillConfig.tag}">
        ${distillLevel === DISTILL_LEVEL.SOVEREIGN ? BADGE_ICONS.shield : (distillLevel === DISTILL_LEVEL.OPTIMIZED ? BADGE_ICONS.sparkles : BADGE_ICONS.brain)}
        ${distillConfig.tag}
      </span>`;
    }

    // Stats line for distilled models
    let statsLine = '';
    if (isDistilled && regModel.stats.distillScore > 0) {
      const compression = regModel.neuroCortex?.compressionRatio?.toFixed(1) || '3.0';
      const pruning = Math.round((regModel.stats.pruningRatio || 0) * 100);
      statsLine = `<span class="model-item-stats">
        ${compression}x compression · ${pruning}% élagué · Score ${Math.round(regModel.stats.distillScore * 100)}%
      </span>`;
    }

    return `
      <div class="model-dropdown-item ${isSelected ? 'selected' : ''}" data-model-id="${model.id}">
        <div class="model-item-main">
          <div class="model-item-left">
            <span class="model-item-name">${model.label.split('·')[0].trim()}</span>
            <span class="model-item-detail">${model.label.split('·')[1]?.trim() || ''} · ${model.size}</span>
            ${statsLine}
          </div>
          <div class="model-item-right">
            ${distillBadges}
            ${statusIndicator}
            ${model.rec ? '<span class="model-item-rec">Recommandé</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleDropdown() {
  dropdownOpen = !dropdownOpen;
  if (dropdownOpen) {
    openDropdown();
  } else {
    closeDropdown();
  }
}

function openDropdown() {
  dropdownOpen = true;
  dropdownEl.innerHTML = buildDropdownItems();
  dropdownEl.classList.add('open');
  wrapperEl.classList.add('active');

  // Bind item clicks
  dropdownEl.querySelectorAll('.model-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const modelId = item.dataset.modelId;
      if (modelId) {
        state.currentModelId = modelId;
        localStorage.setItem('nexus_model', modelId);
        refreshSelector();
        closeDropdown();
        notify('model:selected', { modelId });
      }
    });
  });
}

function closeDropdown() {
  dropdownOpen = false;
  dropdownEl?.classList.remove('open');
  wrapperEl?.classList.remove('active');
}

function refreshSelector() {
  if (selectedDisplayEl) {
    selectedDisplayEl.innerHTML = buildSelectedDisplay(state.currentModelId);
  }
  if (dropdownOpen && dropdownEl) {
    dropdownEl.innerHTML = buildDropdownItems();
    // Re-bind clicks
    dropdownEl.querySelectorAll('.model-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const modelId = item.dataset.modelId;
        if (modelId) {
          state.currentModelId = modelId;
          localStorage.setItem('nexus_model', modelId);
          refreshSelector();
          closeDropdown();
          notify('model:selected', { modelId });
        }
      });
    });
  }
}

/**
 * Build the enhanced loading status badge for the navbar
 */
export function buildPhaseBadge(phase, text, progress) {
  const config = BADGE_CONFIG.phases[phase] || BADGE_CONFIG.phases[MODEL_PHASE.IDLE];
  const icon = getPhaseIconSVG(phase);
  const animClass = config.animate ? `animate-${config.animate}` : '';
  const glowClass = config.glow ? 'badge-glow' : '';

  let progressBar = '';
  if (progress > 0 && progress < 100 && phase !== MODEL_PHASE.READY) {
    progressBar = `<span class="badge-progress-bar"><span class="badge-progress-fill" style="width: ${progress}%"></span></span>`;
  }

  return `
    <span class="badge badge-nc badge-nc-${config.color} ${glowClass}">
      <span class="badge-phase-icon ${animClass}">${icon}</span>
      <span class="badge-phase-label">${text || config.label}</span>
      ${progressBar}
    </span>
  `;
}

export function destroyModelSelector() {
  if (closeHandler) {
    document.removeEventListener('click', closeHandler);
  }
}
