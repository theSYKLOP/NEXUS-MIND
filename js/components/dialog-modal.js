/* ==========================================================================
   NEXUS-MIND — DIALOG MODAL & TOAST SYSTEM (js/components/dialog-modal.js)
   Replaces native window.confirm() and window.alert() with sleek,
   reliable in-app dark glassmorphic dialogs that NEVER get suppressed.
   ========================================================================== */

import ICONS from '../icons.js';
import { state } from '../state.js';

let dialogContainerEl = null;
let toastContainerEl = null;

function ensureContainers() {
  if (!dialogContainerEl) {
    dialogContainerEl = document.getElementById('dialog-modal-container');
    if (!dialogContainerEl) {
      dialogContainerEl = document.createElement('div');
      dialogContainerEl.id = 'dialog-modal-container';
      document.body.appendChild(dialogContainerEl);
    }
  }

  if (!toastContainerEl) {
    toastContainerEl = document.getElementById('toast-container');
    if (!toastContainerEl) {
      toastContainerEl = document.createElement('div');
      toastContainerEl.id = 'toast-container';
      toastContainerEl.className = 'nexus-toast-container';
      document.body.appendChild(toastContainerEl);
    }
  }
}

/**
 * Modern in-app confirmation modal (Promise-based)
 * @param {Object} options
 * @param {string} options.title Modal title
 * @param {string} options.message Main message
 * @param {string} [options.details] Secondary detailed message
 * @param {string} [options.confirmText] Confirm button text (default: 'Confirmer')
 * @param {string} [options.cancelText] Cancel button text (default: 'Annuler')
 * @param {boolean} [options.danger] If true, style confirm button in danger red
 * @returns {Promise<boolean>}
 */
export function confirmModal({
  title = 'Confirmation',
  message = 'Êtes-vous sûr de vouloir continuer ?',
  details = '',
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  danger = false
} = {}) {
  ensureContainers();

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'nexus-dialog-overlay active';

    overlay.innerHTML = `
      <div class="nexus-dialog-window">
        <div class="nexus-dialog-header">
          <div class="nexus-dialog-icon ${danger ? 'danger' : 'info'}">
            ${danger ? ICONS.trash : ICONS.brain}
          </div>
          <div class="nexus-dialog-title-group">
            <h3 class="nexus-dialog-title">${escapeHtml(title)}</h3>
            <p class="nexus-dialog-subtitle">${escapeHtml(message)}</p>
          </div>
          <button class="nexus-dialog-close-btn" aria-label="Fermer">
            ${ICONS.x}
          </button>
        </div>

        ${details ? `
          <div class="nexus-dialog-body">
            <div class="nexus-dialog-details-card">${escapeHtml(details)}</div>
          </div>
        ` : ''}

        <div class="nexus-dialog-footer">
          <button class="btn btn-ghost btn-cancel-dialog">${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger-glow' : 'btn-gemini'} btn-confirm-dialog">
            ${danger ? ICONS.trash : ICONS.check}
            <span>${escapeHtml(confirmText)}</span>
          </button>
        </div>
      </div>
    `;

    dialogContainerEl.appendChild(overlay);

    const btnConfirm = overlay.querySelector('.btn-confirm-dialog');
    const btnCancel = overlay.querySelector('.btn-cancel-dialog');
    const btnClose = overlay.querySelector('.nexus-dialog-close-btn');

    let isDone = false;
    const cleanup = (result) => {
      if (isDone) return;
      isDone = true;
      window.removeEventListener('keydown', onKeyDown);
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(true);
      }
    };

    btnConfirm?.addEventListener('click', () => cleanup(true));
    btnCancel?.addEventListener('click', () => cleanup(false));
    btnClose?.addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    window.addEventListener('keydown', onKeyDown);
    btnConfirm?.focus();
  });
}

/**
 * Dedicated modal for clearing IndexedDB Local Base
 * Offers choice between clearing Knowledge Base only (RAG docs + chunks + graph)
 * or Full Reset (KB + discussions + messages).
 * @returns {Promise<'kb'|'all'|null>}
 */
export function showClearLocalBaseModal() {
  ensureContainers();

  const totalDocs = state.kbStats?.docsCount || 0;
  const totalChunks = state.kbStats?.chunksCount || 0;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'nexus-dialog-overlay active';

    overlay.innerHTML = `
      <div class="nexus-dialog-window clear-localbase-window">
        <div class="nexus-dialog-header">
          <div class="nexus-dialog-icon danger">
            ${ICONS.database}
          </div>
          <div class="nexus-dialog-title-group">
            <h3 class="nexus-dialog-title">Vider la Base Locale IndexedDB</h3>
            <p class="nexus-dialog-subtitle">Sélectionnez le niveau de réinitialisation souhaité :</p>
          </div>
          <button class="nexus-dialog-close-btn" aria-label="Fermer">
            ${ICONS.x}
          </button>
        </div>

        <div class="nexus-dialog-body">
          <div class="kb-current-stats-pill">
            <div class="stat-item">
              <span class="stat-number">${totalDocs}</span>
              <span class="stat-label">Document(s)</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-number">${totalChunks}</span>
              <span class="stat-label">Fragments (chunks)</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-number">WebGPU</span>
              <span class="stat-label">IndexedDB v2</span>
            </div>
          </div>

          <div class="clear-options-list">
            <!-- Option 1: Knowledge Base only -->
            <button class="clear-option-card" id="btn-clear-kb-only">
              <div class="option-icon-box warn">
                ${ICONS.fileText}
              </div>
              <div class="option-content">
                <div class="option-title">Vider les Connaissances & Chunks (RAG)</div>
                <div class="option-desc">Efface les ${totalDocs} documents, les ${totalChunks} fragments et la carte mentale. Vos discussions restent intactes.</div>
              </div>
              <span class="option-badge">Recommandé</span>
            </button>

            <!-- Option 2: Full Wipe -->
            <button class="clear-option-card danger" id="btn-clear-full-all">
              <div class="option-icon-box danger">
                ${ICONS.trash}
              </div>
              <div class="option-content">
                <div class="option-title">Réinitialisation Complète (Tout vider)</div>
                <div class="option-desc">Efface TOUT : documents, chunks RAG, carte mentale ET l'intégralité de l'historique des discussions.</div>
              </div>
              <span class="option-badge danger">Irréversible</span>
            </button>
          </div>
        </div>

        <div class="nexus-dialog-footer" style="justify-content: flex-end;">
          <button class="btn btn-ghost btn-cancel-dialog">Annuler</button>
        </div>
      </div>
    `;

    dialogContainerEl.appendChild(overlay);

    let isDone = false;
    const cleanup = (choice) => {
      if (isDone) return;
      isDone = true;
      window.removeEventListener('keydown', onKeyDown);
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(choice);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup(null);
      }
    };

    overlay.querySelector('#btn-clear-kb-only')?.addEventListener('click', () => cleanup('kb'));
    overlay.querySelector('#btn-clear-full-all')?.addEventListener('click', () => cleanup('all'));
    overlay.querySelector('.btn-cancel-dialog')?.addEventListener('click', () => cleanup(null));
    overlay.querySelector('.nexus-dialog-close-btn')?.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(null);
    });

    window.addEventListener('keydown', onKeyDown);
  });
}

/**
 * Toast notifications (non-blocking notification bar)
 * @param {string} message Text message
 * @param {'success'|'error'|'info'|'warn'} [type] Toast variant
 * @param {number} [duration] Duration in milliseconds
 */
export function showToast(message, type = 'info', duration = 3200) {
  ensureContainers();

  const toast = document.createElement('div');
  toast.className = `nexus-toast nexus-toast-${type}`;

  const iconMap = {
    success: ICONS.check,
    error: ICONS.trash,
    warn: ICONS.zap,
    info: ICONS.sparkles
  };

  toast.innerHTML = `
    <span class="nexus-toast-icon">${iconMap[type] || ICONS.sparkles}</span>
    <span class="nexus-toast-message">${escapeHtml(message)}</span>
    <button class="nexus-toast-close">${ICONS.x}</button>
  `;

  toastContainerEl.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector('.nexus-toast-close')?.addEventListener('click', dismiss);
  timer = setTimeout(dismiss, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
