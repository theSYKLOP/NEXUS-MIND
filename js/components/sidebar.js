/* ==========================================================================
   NEXUS-MIND — SIDEBAR COMPONENT (Conversations History & Knowledge Base)
   Zero emoji policy — Pure Lucide SVG Icons
   ========================================================================== */

import { state, notify, subscribe } from '../state.js';
import { getConversations, createConversation, deleteConversation, updateConversationTitle, clearAllLocalBase } from '../db.js';
import { importFiles, clearKnowledgeBase, importDistillJSON, refreshKBStats } from '../rag.js';
import { openUrlModal } from './url-modal.js';
import { confirmModal, showClearLocalBaseModal, showToast } from './dialog-modal.js';
import ICONS from '../icons.js';

export function initSidebar() {
  const sidebarEl = document.getElementById('app-sidebar');
  const btnNewChat = document.getElementById('btn-new-chat');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');

  // New Chat Action
  btnNewChat?.addEventListener('click', async () => {
    const conv = await createConversation();
    state.currentConversationId = conv.id;
    await renderConversations();
    notify('chat:selected', { conversationId: conv.id });
  });

  // Toggle Sidebar
  btnToggleSidebar?.addEventListener('click', () => {
    state.sidebarOpen = !state.sidebarOpen;
    sidebarEl?.classList.toggle('collapsed', !state.sidebarOpen);
  });

  // KB Quick Import Actions
  const btnQuickFile = document.getElementById('kb-quick-file');
  const btnQuickUrl = document.getElementById('kb-quick-url');
  const btnQuickDistill = document.getElementById('kb-quick-distill');
  const btnResetKB = document.getElementById('btn-reset-kb');
  const btnQuickReset = document.getElementById('kb-quick-reset');

  btnQuickFile?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.json,.md,.txt,.js,.ts,.py,.html,.css,.yaml,.yml';
    input.onchange = async (e) => {
      if (e.target.files?.length) {
        await importFiles(e.target.files);
      }
    };
    input.click();
  });

  // Open the dedicated URL Import Modal
  btnQuickUrl?.addEventListener('click', () => {
    openUrlModal();
  });

  // Reset / Clear Knowledge Base Modal
  const handleResetKB = async () => {
    const choice = await showClearLocalBaseModal();
    if (!choice) return;

    try {
      if (choice === 'kb') {
        await clearKnowledgeBase();
        updateKBStatsUI();
        showToast("Base de connaissances vidée avec succès (0 documents, 0 fragments).", "success");
      } else if (choice === 'all') {
        await clearAllLocalBase();
        state.currentConversationId = null;
        await refreshKBStats();
        updateKBStatsUI();
        await renderConversations();
        notify('chat:selected', { conversationId: null });
        showToast("Base locale entièrement réinitialisée (Documents & Discussions effacés).", "success");
      }
    } catch (err) {
      console.error('Erreur réinitialisation base:', err);
      showToast("Erreur lors de la réinitialisation : " + err.message, "error");
    }
  };

  btnResetKB?.addEventListener('click', handleResetKB);
  btnQuickReset?.addEventListener('click', handleResetKB);

  btnQuickDistill?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          const txt = await file.text();
          const count = await importDistillJSON(txt);
          showToast(`${count} entrées distillées ajoutées à la mémoire locale.`, "success");
        } catch (err) {
          showToast("Erreur de lecture du JSON distillé : " + err.message, "error");
        }
      }
    };
    input.click();
  });

  // Subscriptions to state changes
  subscribe((event) => {
    if (event === 'kb:updated') {
      updateKBStatsUI();
    } else if (event === 'chat:updated') {
      renderConversations();
    }
  });

  renderConversations();
  updateKBStatsUI();
}

export async function renderConversations() {
  const container = document.getElementById('sidebar-history-list');
  if (!container) return;

  const convs = await getConversations();
  state.conversations = convs;

  if (convs.length === 0) {
    const initialConv = await createConversation();
    state.currentConversationId = initialConv.id;
    convs.push(initialConv);
  } else if (!state.currentConversationId || !convs.some(c => c.id === state.currentConversationId)) {
    state.currentConversationId = convs[0].id;
  }

  container.innerHTML = '';

  const titleHeader = document.createElement('div');
  titleHeader.className = 'history-section-title';
  titleHeader.textContent = 'Discussions récentes';
  container.appendChild(titleHeader);

  convs.forEach(conv => {
    const item = document.createElement('div');
    item.className = `history-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
    item.dataset.id = conv.id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'history-item-title';
    titleSpan.textContent = conv.title || 'Discussion sans titre';

    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'history-item-actions';

    // Inline Edit Button
    const btnRename = document.createElement('button');
    btnRename.className = 'history-action-btn';
    btnRename.innerHTML = ICONS.pencil;
    btnRename.setAttribute('aria-label', 'Renommer la discussion');

    btnRename.onclick = (e) => {
      e.stopPropagation();
      
      const currentTitle = conv.title || 'Discussion sans titre';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'history-item-inline-input';
      input.value = currentTitle;
      
      titleSpan.replaceWith(input);
      input.focus();
      input.select();

      let hasSaved = false;
      const commitTitle = async () => {
        if (hasSaved) return;
        hasSaved = true;
        const newTitle = input.value.trim() || currentTitle;
        await updateConversationTitle(conv.id, newTitle);
        renderConversations();
      };

      input.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitTitle();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          hasSaved = true;
          renderConversations();
        }
      };

      input.onblur = commitTitle;
    };

    // Delete Button
    const btnDel = document.createElement('button');
    btnDel.className = 'history-action-btn delete';
    btnDel.innerHTML = ICONS.trash;
    btnDel.setAttribute('aria-label', 'Supprimer la discussion');

    btnDel.onclick = async (e) => {
      e.stopPropagation();
      const title = conv.title || 'Discussion';
      const confirmed = await confirmModal({
        title: 'Supprimer la discussion',
        message: `Voulez-vous supprimer définitivement la discussion "${title}" ?`,
        details: 'Tous les messages et le contexte associé seront effacés d\'IndexedDB.',
        confirmText: 'Supprimer',
        cancelText: 'Annuler',
        danger: true
      });

      if (confirmed) {
        await deleteConversation(conv.id);
        if (state.currentConversationId === conv.id) {
          const remaining = await getConversations();
          state.currentConversationId = remaining.length > 0 ? remaining[0].id : null;
        }
        await renderConversations();
        notify('chat:selected', { conversationId: state.currentConversationId });
        showToast("Discussion supprimée.", "info");
      }
    };

    actionsDiv.appendChild(btnRename);
    actionsDiv.appendChild(btnDel);

    item.appendChild(titleSpan);
    item.appendChild(actionsDiv);

    item.onclick = () => {
      if (state.currentConversationId !== conv.id) {
        state.currentConversationId = conv.id;
        renderConversations();
        notify('chat:selected', { conversationId: conv.id });
      }
    };

    container.appendChild(item);
  });
}

function updateKBStatsUI() {
  const chunksEl = document.getElementById('kb-stats-chunks');
  const docsEl = document.getElementById('kb-stats-docs');
  if (chunksEl) chunksEl.textContent = `${state.kbStats.chunksCount || 0} chunks`;
  if (docsEl) docsEl.textContent = `${state.kbStats.docsCount || 0} docs`;
}
