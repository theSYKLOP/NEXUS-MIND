/* ==========================================================================
   NEXUS-MIND — URL IMPORT MODAL COMPONENT (js/components/url-modal.js)
   Multi-URL Scraping & Indexing into Local IndexedDB Knowledge Base
   ========================================================================== */

import { scrapeMultipleURLs } from '../rag.js';
import ICONS from '../icons.js';

let modalEl = null;

export function initUrlModal() {
  let container = document.getElementById('url-modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'url-modal-container';
    document.body.appendChild(container);
  }
  modalEl = container;
  renderModal();
}

function renderModal() {
  if (!modalEl) return;

  modalEl.innerHTML = `
    <div class="modal-overlay" id="url-import-overlay">
      <div class="modal-window" style="max-width: 560px;">
        
        <!-- Header -->
        <div class="modal-header">
          <div class="modal-header-title-group">
            <div class="modal-header-icon" style="background: rgba(14, 165, 233, 0.15); border-color: rgba(14, 165, 233, 0.4); color: #38bdf8;">
              ${ICONS.globe}
            </div>
            <div>
              <div class="modal-header-title">Indexer des Adresses Web</div>
              <div class="modal-header-subtitle">Scraping local & découpage en chunks IndexedDB</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-icon" id="btn-close-url-modal" title="Fermer">
            ${ICONS.x}
          </button>
        </div>

        <!-- Body -->
        <div class="modal-body" style="gap: 14px;">
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
            Saisissez une ou plusieurs adresses complètes (une URL par ligne). Le contenu textuel sera extrait via proxy, nettoyé de tout code HTML ou scripts, découpé en fragments de 500 caractères et indexé dans votre mémoire locale.
          </div>

          <textarea
            id="url-modal-textarea"
            class="custom-prompt-textarea"
            style="height: 130px; font-family: var(--font-mono); font-size: 11.5px;"
            placeholder="https://fr.wikipedia.org/wiki/Origine_de_la_vie&#10;https://fr.wikipedia.org/wiki/WebGPU&#10;https://developer.mozilla.org/fr/docs/Web/API"
          ></textarea>

          <div style="display: flex; justify-content: space-between; align-items: center;">
            <button class="btn btn-ghost" id="btn-url-example" style="font-size: 11px; padding: 4px 8px;">
              ${ICONS.sparkles} Remplir avec un exemple
            </button>
            <span id="url-modal-count" style="font-size: 11px; color: var(--text-muted);">0 URL détectée</span>
          </div>

          <!-- Progress / Status Box -->
          <div id="url-modal-status-box" style="display: none; padding: 12px; border-radius: var(--radius-md); background: var(--bg-surface); border: 1px solid var(--border-subtle); font-size: 12px;">
            <div id="url-modal-status-text" style="color: var(--text-main); font-weight: 500;">Indexation en cours…</div>
            <div class="model-progress-bar" style="margin-top: 8px; height: 5px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;">
              <div id="url-modal-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #0ea5e9, #4e75f6); transition: width 200ms ease;"></div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button class="btn btn-ghost" id="btn-cancel-url-modal">Annuler</button>
          <button class="btn btn-primary" id="btn-submit-url-scrape" style="background: linear-gradient(135deg, #0ea5e9, #4e75f6); border-color: transparent;">
            ${ICONS.database} Lancer l'indexation
          </button>
        </div>

      </div>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  const overlay = document.getElementById('url-import-overlay');
  const textarea = document.getElementById('url-modal-textarea');
  const countEl = document.getElementById('url-modal-count');
  const btnClose = document.getElementById('btn-close-url-modal');
  const btnCancel = document.getElementById('btn-cancel-url-modal');
  const btnSubmit = document.getElementById('btn-submit-url-scrape');
  const btnExample = document.getElementById('btn-url-example');
  const statusBox = document.getElementById('url-modal-status-box');
  const statusText = document.getElementById('url-modal-status-text');
  const progressBar = document.getElementById('url-modal-progress-fill');

  const getUrls = () => {
    return (textarea?.value || '')
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('http://') || u.startsWith('https://'));
  };

  const updateCount = () => {
    const urls = getUrls();
    if (countEl) {
      countEl.textContent = `${urls.length} URL${urls.length > 1 ? 's' : ''} valide${urls.length > 1 ? 's' : ''}`;
    }
  };

  textarea?.addEventListener('input', updateCount);

  btnExample?.addEventListener('click', () => {
    if (textarea) {
      textarea.value = `https://fr.wikipedia.org/wiki/Origine_de_la_vie\nhttps://fr.wikipedia.org/wiki/Histoire_évolutive_de_la_lignée_humaine`;
      updateCount();
    }
  });

  const close = () => {
    overlay?.classList.remove('active');
  };

  btnClose?.addEventListener('click', close);
  btnCancel?.addEventListener('click', close);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  btnSubmit?.addEventListener('click', async () => {
    const urls = getUrls();
    if (urls.length === 0) {
      alert("Veuillez saisir au moins une URL valide débutant par http:// ou https://.");
      return;
    }

    btnSubmit.disabled = true;
    btnCancel.disabled = true;
    if (statusBox) statusBox.style.display = 'block';

    try {
      const results = await scrapeMultipleURLs(urls, (current, total, currentUrl) => {
        const pct = Math.round((current / total) * 100);
        if (statusText) {
          statusText.textContent = `[${current}/${total}] Téléchargement et indexation : ${currentUrl.slice(0, 40)}…`;
        }
        if (progressBar) {
          progressBar.style.width = `${pct}%`;
        }
      });

      if (statusText) {
        statusText.innerHTML = `✅ <b>Indexation terminée avec succès !</b><br/>${results.success} adresse(s) ajoutée(s) à la mémoire locale${results.failed > 0 ? ` (${results.failed} échec(s))` : ''}.`;
      }
      if (progressBar) progressBar.style.width = '100%';

      setTimeout(() => {
        close();
        if (statusBox) statusBox.style.display = 'none';
        if (textarea) textarea.value = '';
        updateCount();
        btnSubmit.disabled = false;
        btnCancel.disabled = false;
      }, 1600);

    } catch (err) {
      if (statusText) statusText.textContent = `❌ Erreur : ${err.message}`;
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
    }
  });
}

export function openUrlModal() {
  renderModal();
  const overlay = document.getElementById('url-import-overlay');
  overlay?.classList.add('active');
  document.getElementById('url-modal-textarea')?.focus();
}

export function closeUrlModal() {
  const overlay = document.getElementById('url-import-overlay');
  overlay?.classList.remove('active');
}
