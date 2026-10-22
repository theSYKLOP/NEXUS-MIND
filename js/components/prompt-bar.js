/* ==========================================================================
   NEXUS-MIND — PROMPT BAR (Gemini / ChatGPT / Claude Responsive Input)
   Zero emoji policy — Pure Lucide SVG Icons
   ========================================================================== */

import { state, notify } from '../state.js';
import { importFiles } from '../rag.js';
import ICONS from '../icons.js';

export function initPromptBar(onSendMessage) {
  const textarea = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('prompt-send-btn');
  const ragToggleBtn = document.getElementById('prompt-rag-toggle');
  const attachBtn = document.getElementById('prompt-attach-btn');

  if (!textarea) return;

  // Auto-grow textarea
  function autoResize() {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${Math.max(newHeight, 24)}px`;
    if (sendBtn) {
      sendBtn.disabled = !textarea.value.trim() || state.isGenerating;
    }
  }

  textarea.addEventListener('input', autoResize);

  // Keydown handling: Enter sends, Shift+Enter inserts newline
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Send button click
  sendBtn?.addEventListener('click', handleSend);

  function handleSend() {
    const text = textarea.value.trim();
    if (!text || state.isGenerating) return;
    textarea.value = '';
    autoResize();
    if (onSendMessage) {
      onSendMessage(text);
    }
  }

  // RAG Toggle
  ragToggleBtn?.addEventListener('click', () => {
    state.ragEnabled = !state.ragEnabled;
    ragToggleBtn.classList.toggle('active', state.ragEnabled);
    ragToggleBtn.setAttribute('data-tooltip', state.ragEnabled ? 'RAG activé (mémoire locale injectée)' : 'RAG désactivé');
    const label = ragToggleBtn.querySelector('.rag-status-text');
    if (label) label.textContent = state.ragEnabled ? 'RAG: Actif' : 'RAG: Inactif';
  });

  // Web Search Toggle
  const webToggleBtn = document.getElementById('prompt-web-toggle');
  if (webToggleBtn) {
    const isWebActive = state.webSearchEnabled ?? true;
    webToggleBtn.classList.toggle('web-active', isWebActive);
    const label = webToggleBtn.querySelector('.web-status-text');
    if (label) label.textContent = isWebActive ? 'Web: Actif' : 'Web: Inactif';
  }

  webToggleBtn?.addEventListener('click', () => {
    state.webSearchEnabled = !state.webSearchEnabled;
    webToggleBtn.classList.toggle('web-active', state.webSearchEnabled);
    webToggleBtn.setAttribute('data-tooltip', state.webSearchEnabled ? 'Recherche Web Open Source active (enrichit le modèle)' : 'Recherche Web désactivée');
    const label = webToggleBtn.querySelector('.web-status-text');
    if (label) label.textContent = state.webSearchEnabled ? 'Web: Actif' : 'Web: Inactif';
  });

  // Attach files to KB directly from prompt bar
  attachBtn?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.json,.md,.txt,.js,.ts,.py,.html,.css';
    input.onchange = async (e) => {
      if (e.target.files?.length) {
        await importFiles(e.target.files);
        textarea.placeholder = 'Fichiers attachés à la mémoire. Posez votre question…';
        setTimeout(() => {
          textarea.placeholder = 'Posez votre question à NEXUS-MIND… (Entrée pour envoyer, Maj+Entrée pour retour ligne)';
        }, 4000);
      }
    };
    input.click();
  });
}
