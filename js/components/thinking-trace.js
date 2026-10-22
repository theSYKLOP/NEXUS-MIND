/* ==========================================================================
   NEXUS-MIND — THINKING TRACE COMPONENT
   Real-time reasoning trace display with animated status icons.
   Inspired by Qwen "En train de réfléchir…" / Claude "Thinking…"
   ========================================================================== */

import ICONS from '../icons.js';

// ── Thinking Stage Types ──
export const THINKING_STAGE = {
  THINKING: 'thinking',
  SEARCHING: 'searching',
  RAG_LOOKUP: 'rag_lookup',
  WEB_SEARCH: 'web_search',
  TOOL_USE: 'tool_use',
  GENERATING: 'generating',
  COMPLETED: 'completed',
};

// ── Stage Metadata ──
const STAGE_META = {
  [THINKING_STAGE.THINKING]: {
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    iconClass: 'thinking',
    label: 'En train de réfléchir',
  },
  [THINKING_STAGE.SEARCHING]: {
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    iconClass: 'searching',
    label: 'Recherche en cours',
  },
  [THINKING_STAGE.RAG_LOOKUP]: {
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
    iconClass: 'searching',
    label: 'Consultation de la base locale',
  },
  [THINKING_STAGE.WEB_SEARCH]: {
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
    iconClass: 'searching',
    label: 'Recherche web en cours',
  },
  [THINKING_STAGE.TOOL_USE]: {
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    iconClass: 'tool-use',
    label: 'Utilisation d\'un outil',
  },
  [THINKING_STAGE.GENERATING]: {
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
    iconClass: 'thinking',
    label: 'Génération en cours',
  },
  [THINKING_STAGE.COMPLETED]: {
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    iconClass: 'completed',
    label: 'Réflexion terminée',
  },
};

/**
 * Create a ThinkingTrace controller that manages the real-time trace display.
 * @param {HTMLElement} parentElement - The message body container to attach the trace to.
 * @returns {ThinkingTraceController}
 */
export function createThinkingTrace(parentElement) {
  let startTime = Date.now();
  let currentStage = THINKING_STAGE.THINKING;
  let isExpanded = false;
  let isCompleted = false;
  let traceSteps = [];
  let summaryText = '';
  let durationInterval = null;

  // ── Build DOM ──
  const traceContainer = document.createElement('div');
  traceContainer.className = 'thinking-trace';

  const header = document.createElement('div');
  header.className = 'thinking-header';

  const iconEl = document.createElement('div');
  iconEl.className = 'thinking-icon thinking';
  iconEl.innerHTML = STAGE_META[THINKING_STAGE.THINKING].icon;

  const labelEl = document.createElement('div');
  labelEl.className = 'thinking-label';
  labelEl.innerHTML = `${STAGE_META[THINKING_STAGE.THINKING].label}<span class="thinking-dots"><span></span><span></span><span></span></span>`;

  const durationEl = document.createElement('div');
  durationEl.className = 'thinking-duration';
  durationEl.textContent = '';

  const chevronEl = document.createElement('div');
  chevronEl.className = 'thinking-chevron';
  chevronEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  header.appendChild(iconEl);
  header.appendChild(labelEl);
  header.appendChild(durationEl);
  header.appendChild(chevronEl);

  const body = document.createElement('div');
  body.className = 'thinking-body';

  const bodyContent = document.createElement('div');
  bodyContent.className = 'thinking-body-content';
  body.appendChild(bodyContent);

  traceContainer.appendChild(header);
  traceContainer.appendChild(body);

  // Insert at the top of the parent element (before the message bubble)
  parentElement.insertBefore(traceContainer, parentElement.firstChild);

  // ── Toggle expand/collapse ──
  header.addEventListener('click', () => {
    isExpanded = !isExpanded;
    header.classList.toggle('expanded', isExpanded);
    body.classList.toggle('expanded', isExpanded);
  });

  // ── Duration timer ──
  durationInterval = setInterval(() => {
    if (!isCompleted) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      durationEl.textContent = `${elapsed}s`;
    }
  }, 1000);

  // ── Controller API ──
  const controller = {
    /**
     * Update the thinking stage and label text.
     * @param {string} stage - One of THINKING_STAGE values
     * @param {string} [label] - Custom label text (optional)
     */
    setStage(stage, label) {
      currentStage = stage;
      const meta = STAGE_META[stage] || STAGE_META[THINKING_STAGE.THINKING];

      iconEl.className = `thinking-icon ${meta.iconClass}`;
      iconEl.innerHTML = meta.icon;

      const displayLabel = label || meta.label;
      if (stage === THINKING_STAGE.COMPLETED) {
        labelEl.textContent = displayLabel;
      } else {
        labelEl.innerHTML = `${displayLabel}<span class="thinking-dots"><span></span><span></span><span></span></span>`;
      }
    },

    /**
     * Add a step to the trace body (collapsible detail).
     * @param {string} text - Step description
     * @param {string} [stage] - Step icon type
     */
    addStep(text, stage = THINKING_STAGE.THINKING) {
      const meta = STAGE_META[stage] || STAGE_META[THINKING_STAGE.THINKING];
      const stepEl = document.createElement('div');
      stepEl.className = 'thinking-step';
      stepEl.innerHTML = `
        <div class="thinking-step-icon active">${meta.icon}</div>
        <div class="thinking-step-text">${escapeHtml(text)}</div>
      `;
      traceSteps.push(stepEl);
      bodyContent.appendChild(stepEl);

      // Auto-scroll body if expanded
      if (isExpanded) {
        body.scrollTop = body.scrollHeight;
      }
    },

    /**
     * Set the summary text (shown in the collapsible body).
     * @param {string} text - Summary text
     */
    setSummary(text) {
      summaryText = text;
      // Show as first element in body
      let summaryEl = bodyContent.querySelector('.thinking-summary');
      if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.className = 'thinking-summary';
        summaryEl.style.cssText = 'font-size: 12.5px; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.5;';
        bodyContent.insertBefore(summaryEl, bodyContent.firstChild);
      }
      summaryEl.textContent = text;
    },

    /**
     * Complete the thinking trace.
     * @param {string} [label] - Final label text
     */
    complete(label) {
      isCompleted = true;
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      durationEl.textContent = `${elapsed}s`;

      currentStage = THINKING_STAGE.COMPLETED;
      const meta = STAGE_META[THINKING_STAGE.COMPLETED];
      iconEl.className = `thinking-icon ${meta.iconClass}`;
      iconEl.innerHTML = meta.icon;

      const finalLabel = label || `Réflexion terminée`;
      labelEl.textContent = finalLabel;

      header.classList.add('completed');
    },

    /**
     * Destroy the thinking trace (remove from DOM).
     */
    destroy() {
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
      traceContainer.remove();
    },

    /**
     * Get the thinking trace container element.
     */
    get element() {
      return traceContainer;
    },

    /**
     * Get elapsed time in ms.
     */
    get elapsed() {
      return Date.now() - startTime;
    },
  };

  return controller;
}

/**
 * Create a user prompt bubble with collapse/expand functionality for long text.
 * @param {string} text - The user's prompt text
 * @param {HTMLElement} bubble - The message bubble element
 */
export function setupUserPromptCollapse(text, bubble) {
  const LINE_THRESHOLD = 6; // Number of lines before collapse kicks in
  const CHAR_THRESHOLD = 300; // Character count threshold

  if (text.length < CHAR_THRESHOLD && text.split('\n').length <= LINE_THRESHOLD) {
    // Short prompt — no collapse needed
    bubble.textContent = text;
    return;
  }

  // Mark as collapsible
  bubble.classList.add('user-bubble-collapsible');
  bubble.innerHTML = '';

  const contentEl = document.createElement('div');
  contentEl.className = 'user-prompt-content collapsed';
  contentEl.textContent = text;
  bubble.appendChild(contentEl);

  const expandBtn = document.createElement('button');
  expandBtn.className = 'user-prompt-expand-btn';
  expandBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    <span>Afficher plus</span>
  `;
  bubble.appendChild(expandBtn);

  let isExpanded = false;
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isExpanded = !isExpanded;
    contentEl.classList.toggle('collapsed', !isExpanded);
    expandBtn.classList.toggle('expanded', isExpanded);
    expandBtn.querySelector('span').textContent = isExpanded ? 'Réduire' : 'Afficher plus';
  });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
