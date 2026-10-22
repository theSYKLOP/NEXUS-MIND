/* ==========================================================================
   NEXUS-MIND — CHAT VIEW (Markdown Rendering, Highlighting, Citations)
   Zero emoji policy — Pure Lucide SVG Icons
   ========================================================================== */

import { state, notify, subscribe } from '../state.js';
import { getMessagesForConversation, saveMessage } from '../db.js';
import { openArtifactsPanel } from './artifacts-panel.js';
import { extractGraphData } from './graph-view.js';
import ICONS from '../icons.js';

export function initChatView(onSuggestionClick) {
  const messagesScrollEl = document.getElementById('chat-messages-scroll');

  subscribe(async (event, payload) => {
    if (event === 'chat:selected') {
      await loadConversationMessages(payload.conversationId);
    }
  });

  // Delegate clicks for code copy buttons and artifact cards
  messagesScrollEl?.addEventListener('click', (e) => {
    // Copy code button
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
      const codeBlock = copyBtn.closest('.code-block-container')?.querySelector('code');
      if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.innerText).then(() => {
          copyBtn.innerHTML = `${ICONS.check} <span>Copié</span>`;
          setTimeout(() => {
            copyBtn.innerHTML = `${ICONS.copy} <span>Copier</span>`;
          }, 2000);
        });
      }
      return;
    }

    // Open Artifact Card
    const artifactCard = e.target.closest('.artifact-trigger-card');
    if (artifactCard) {
      const tab = artifactCard.dataset.tab || 'graph';
      openArtifactsPanel(tab);
      return;
    }

    // Suggestion Cards in Empty State
    const card = e.target.closest('.suggestion-card');
    if (card && onSuggestionClick) {
      const prompt = card.dataset.prompt;
      if (prompt) onSuggestionClick(prompt);
      return;
    }
  });
}

export async function loadConversationMessages(conversationId) {
  const container = document.getElementById('chat-messages-inner');
  if (!container) return;

  if (!conversationId) {
    renderEmptyState(container);
    return;
  }

  const messages = await getMessagesForConversation(conversationId);
  state.activeMessages = messages;

  if (messages.length === 0) {
    renderEmptyState(container);
  } else {
    container.innerHTML = '';
    messages.forEach(msg => {
      appendMessageToDOM(msg, false);
    });
    scrollToBottom();
  }
}

export function renderEmptyState(container) {
  container.innerHTML = `
    <div class="empty-state animate-fade-in">
      <div class="empty-state-badge">
        ${ICONS.cpu}
        <span>WebGPU Local-First</span>
      </div>
      <h1 class="empty-state-title">Bonjour, que souhaitez-vous explorer ?</h1>
      <p class="empty-state-subtitle">
        NEXUS-MIND est votre assistant IA souverain. Il s'exécute directement dans votre navigateur, mémorise vos documents locaux et cartographie vos idées.
      </p>

      <div class="suggestion-cards-grid">
        <div class="suggestion-card" data-prompt="Quelles sont les connaissances actuellement stockées dans ma base locale ?">
          <div class="suggestion-card-icon">${ICONS.database}</div>
          <div class="suggestion-card-title">Explorer la mémoire locale</div>
          <div class="suggestion-card-desc">Inspecter les documents et chunks indexés en IndexedDB</div>
        </div>

        <div class="suggestion-card" data-prompt="Génère une carte mentale des principes clés du Local-First et du RAG sous forme de graphe.">
          <div class="suggestion-card-icon">${ICONS.network}</div>
          <div class="suggestion-card-title">Cartographie conceptuelle</div>
          <div class="suggestion-card-desc">Générer un graphe interactif dans le panneau d'artefacts</div>
        </div>

        <div class="suggestion-card" data-prompt="Comment puis-je connecter mon dossier de projet local et analyser le code ?">
          <div class="suggestion-card-icon">${ICONS.terminal}</div>
          <div class="suggestion-card-title">Sandbox & Code Local</div>
          <div class="suggestion-card-desc">Lire et proposer des diffs sécurisés sur mes fichiers</div>
        </div>
      </div>
    </div>
  `;
}

export function appendMessageToDOM(msg, animate = true) {
  const container = document.getElementById('chat-messages-inner');
  if (!container) return null;

  // Clear empty state if present
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const isUser = msg.role === 'user';
  const row = document.createElement('div');
  row.className = `message-row ${isUser ? 'user-row' : 'assistant-row'} ${animate ? 'animate-fade-in' : ''}`;
  row.id = msg.id || `msg_${Date.now()}`;

  const avatar = document.createElement('div');
  avatar.className = `message-avatar ${isUser ? 'user-avatar' : 'assistant-avatar'}`;
  avatar.innerHTML = isUser ? ICONS.user : ICONS.bot;

  const body = document.createElement('div');
  body.className = 'message-body';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (isUser) {
    bubble.textContent = msg.content;
  } else {
    bubble.innerHTML = formatMarkdown(msg.content);
  }

  body.appendChild(bubble);

  // Context pills row (RAG Local + Web Search)
  if ((msg.ragSources && msg.ragSources.length > 0) || (msg.webSources && msg.webSources.length > 0)) {
    const metaRow = document.createElement('div');
    metaRow.className = 'message-meta-row';

    if (msg.ragSources && msg.ragSources.length > 0) {
      const pill = document.createElement('div');
      pill.className = 'rag-context-pill';
      pill.innerHTML = `
        ${ICONS.database}
        <span>${msg.ragSources.length} source${msg.ragSources.length > 1 ? 's' : ''} locale${msg.ragSources.length > 1 ? 's' : ''} consultée${msg.ragSources.length > 1 ? 's' : ''}</span>
      `;
      pill.onclick = () => openArtifactsPanel('kb');
      metaRow.appendChild(pill);
    }

    if (msg.webSources && msg.webSources.length > 0) {
      const webPill = document.createElement('div');
      webPill.className = 'web-context-pill';
      webPill.innerHTML = `
        ${ICONS.globe}
        <span>${msg.webSources.length} source${msg.webSources.length > 1 ? 's' : ''} web (Wikipédia / Live)</span>
      `;
      webPill.title = msg.webSources.map(s => `${s.title} : ${s.url}`).join('\n');
      webPill.onclick = () => {
        if (msg.webSources[0]?.url) {
          window.open(msg.webSources[0].url, '_blank');
        }
      };
      metaRow.appendChild(webPill);
    }

    body.appendChild(metaRow);
  }

  // If Graph was extracted, add Artifact card trigger
  if (msg.graphData || (!isUser && msg.content.includes('```graph'))) {
    const artifactCard = document.createElement('div');
    artifactCard.className = 'artifact-trigger-card';
    artifactCard.dataset.tab = 'graph';
    artifactCard.innerHTML = `
      <div class="artifact-card-left">
        <div class="artifact-card-icon">${ICONS.network}</div>
        <div>
          <div class="artifact-card-title">Carte Mentale (Graphify)</div>
          <div class="artifact-card-subtitle">Relations et concepts identifiés</div>
        </div>
      </div>
      <div class="artifact-card-action" style="display: flex; align-items: center; gap: 4px;">
        <span>Voir l'artefact</span>
        ${ICONS.arrowRight}
      </div>
    `;
    body.appendChild(artifactCard);
  }

  if (isUser) {
    row.appendChild(body);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(body);
  }

  container.appendChild(row);
  scrollToBottom();
  return { row, bubble, body };
}

let renderRafId = null;
let pendingText = '';
let pendingRow = null;

export function updateStreamingMessage(msgRow, currentText) {
  if (!msgRow) return;
  pendingRow = msgRow;
  pendingText = currentText;

  if (!renderRafId) {
    renderRafId = requestAnimationFrame(() => {
      renderRafId = null;
      if (pendingRow && pendingText) {
        const bubble = pendingRow.bubble;
        const cleanDisplay = pendingText.replace(/```graph[\s\S]*?```/g, '\n*(Génération de la carte conceptuelle…)*');
        bubble.innerHTML = formatMarkdown(cleanDisplay) + '<span class="streaming-caret"></span>';
        scrollToBottom();
      }
    });
  }
}

export function finalizeStreamingMessage(msgRow, fullText, ragSources = [], webSources = []) {
  if (renderRafId) {
    cancelAnimationFrame(renderRafId);
    renderRafId = null;
  }
  if (!msgRow) return;
  const bubble = msgRow.bubble;
  bubble.innerHTML = formatMarkdown(fullText);

  // If context pills weren't added yet, add them now
  if (!msgRow.body.querySelector('.message-meta-row') && ((ragSources && ragSources.length > 0) || (webSources && webSources.length > 0))) {
    const metaRow = document.createElement('div');
    metaRow.className = 'message-meta-row';

    if (ragSources && ragSources.length > 0) {
      const pill = document.createElement('div');
      pill.className = 'rag-context-pill';
      pill.innerHTML = `
        ${ICONS.database}
        <span>${ragSources.length} source${ragSources.length > 1 ? 's' : ''} locale${ragSources.length > 1 ? 's' : ''} consultée${ragSources.length > 1 ? 's' : ''}</span>
      `;
      pill.onclick = () => openArtifactsPanel('kb');
      metaRow.appendChild(pill);
    }

    if (webSources && webSources.length > 0) {
      const webPill = document.createElement('div');
      webPill.className = 'web-context-pill';
      webPill.innerHTML = `
        ${ICONS.globe}
        <span>${webSources.length} source${webSources.length > 1 ? 's' : ''} web (Wikipédia / Live)</span>
      `;
      webPill.title = webSources.map(s => `${s.title} : ${s.url}`).join('\n');
      webPill.onclick = () => {
        if (webSources[0]?.url) {
          window.open(webSources[0].url, '_blank');
        }
      };
      metaRow.appendChild(webPill);
    }

    msgRow.body.appendChild(metaRow);
  }

  // Extract graph data if any
  const graphData = extractGraphData(fullText);
  if (graphData) {
    const artifactCard = document.createElement('div');
    artifactCard.className = 'artifact-trigger-card';
    artifactCard.dataset.tab = 'graph';
    artifactCard.innerHTML = `
      <div class="artifact-card-left">
        <div class="artifact-card-icon">${ICONS.network}</div>
        <div>
          <div class="artifact-card-title">Carte Mentale (Graphify)</div>
          <div class="artifact-card-subtitle">Relations et concepts identifiés</div>
        </div>
      </div>
      <div class="artifact-card-action" style="display: flex; align-items: center; gap: 4px;">
        <span>Voir l'artefact</span>
        ${ICONS.arrowRight}
      </div>
    `;
    msgRow.body.appendChild(artifactCard);
    openArtifactsPanel('graph');
  }

  scrollToBottom();
}

export function formatMarkdown(text) {
  if (!text) return '';
  if (typeof text !== 'string') {
    text = String(text);
  }
  if (window.marked) {
    const renderer = new window.marked.Renderer();
    renderer.code = function(codeOrToken, language) {
      let codeStr = '';
      let langStr = '';
      if (codeOrToken && typeof codeOrToken === 'object') {
        codeStr = codeOrToken.text || codeOrToken.raw || '';
        langStr = codeOrToken.lang || language || '';
      } else {
        codeStr = String(codeOrToken || '');
        langStr = String(language || '');
      }

      if (langStr.trim() === 'graph') {
        return '';
      }
      const validLang = window.hljs && langStr && window.hljs.getLanguage(langStr) ? langStr : '';
      const highlighted = validLang ? window.hljs.highlight(codeStr, { language: validLang }).value : escapeHtml(codeStr);
      return `
        <div class="code-block-container">
          <div class="code-block-header">
            <span>${escapeHtml(langStr || 'code')}</span>
            <button class="code-copy-btn">${ICONS.copy} <span>Copier</span></button>
          </div>
          <pre><code class="hljs ${validLang}">${highlighted}</code></pre>
        </div>
      `;
    };

    window.marked.setOptions({
      renderer,
      breaks: true,
      gfm: true
    });

    return window.marked.parse(text);
  }

  return escapeHtml(text).replace(/\n/g, '<br>');
}

function scrollToBottom() {
  const el = document.getElementById('chat-messages-scroll');
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
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
