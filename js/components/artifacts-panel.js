/* ==========================================================================
   NEXUS-MIND — ARTIFACTS DOCK PANEL (Claude Desktop Style)
   Zero emoji policy — Pure Lucide SVG Icons
   ========================================================================== */

import { state, notify, subscribe } from '../state.js';
import { fitGraph, exportGraphJSON } from './graph-view.js';
import { getSkills } from '../skills.js';
import { dbGetAll, deleteDocument } from '../db.js';
import { refreshKBStats } from '../rag.js';
import { confirmModal, showToast } from './dialog-modal.js';
import ICONS from '../icons.js';

export function initArtifactsPanel() {
  const panel = document.getElementById('app-artifacts-panel');
  const btnClose = document.getElementById('btn-close-artifacts');
  const btnMaximize = document.getElementById('btn-maximize-artifacts');
  const tabButtons = document.querySelectorAll('.artifact-tab-btn');

  // Close Panel
  btnClose?.addEventListener('click', () => {
    closeArtifactsPanel();
  });

  // Maximize / Restore Panel
  btnMaximize?.addEventListener('click', () => {
    state.artifactsMaximized = !state.artifactsMaximized;
    panel?.classList.toggle('maximized', state.artifactsMaximized);
    btnMaximize.innerHTML = state.artifactsMaximized ? ICONS.minimize : ICONS.maximize;
    if (state.activeArtifactTab === 'graph') {
      setTimeout(fitGraph, 250);
    }
  });

  // Tab Switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchArtifactTab(tabId);
    });
  });

  // Graph toolbar buttons
  document.getElementById('btn-graph-fit')?.addEventListener('click', fitGraph);
  document.getElementById('btn-graph-export')?.addEventListener('click', exportGraphJSON);

  // Sandbox Connect Folder
  document.getElementById('btn-connect-fs')?.addEventListener('click', connectFS);

  // Subscribe to state notifications
  subscribe((event) => {
    if (event === 'skills:updated') {
      renderSkillsTab();
    } else if (event === 'kb:updated') {
      renderKBTab();
    }
  });

  renderSkillsTab();
  renderKBTab();
}

export function openArtifactsPanel(tabName = 'graph') {
  const panel = document.getElementById('app-artifacts-panel');
  state.artifactsOpen = true;
  panel?.classList.remove('collapsed');
  switchArtifactTab(tabName);
}

export function closeArtifactsPanel() {
  const panel = document.getElementById('app-artifacts-panel');
  state.artifactsOpen = false;
  panel?.classList.add('collapsed');
}

export function toggleArtifactsPanel(tabName = 'graph') {
  if (state.artifactsOpen && state.activeArtifactTab === tabName) {
    closeArtifactsPanel();
  } else {
    openArtifactsPanel(tabName);
  }
}

export function switchArtifactTab(tabName) {
  state.activeArtifactTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.artifact-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });

  // Update tab panes
  document.querySelectorAll('.artifact-tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-pane-${tabName}`);
  });

  // Trigger resize if graph
  if (tabName === 'graph') {
    setTimeout(fitGraph, 150);
  }
}

/* ==========================================================================
   FILE SYSTEM ACCESS API & SANDBOX AGENT
   ========================================================================== */

export async function connectFS() {
  if (!window.showDirectoryPicker) {
    alert("L'API File System Access n'est pas supportée par ce navigateur.\nVeuillez utiliser Google Chrome ou Microsoft Edge.");
    return;
  }
  try {
    state.fsHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const statusFs = document.getElementById('status-fs-badge');
    if (statusFs) {
      statusFs.textContent = `FS: ${state.fsHandle.name}`;
      statusFs.className = 'badge badge-ok';
    }
    await renderFileTree();
    agentLog(`Dossier local connecté : ${state.fsHandle.name}`);
  } catch (err) {
    if (err.name !== 'AbortError') {
      agentLog(`Erreur connexion dossier : ${err.message}`);
    }
  }
}

export async function renderFileTree(handle = state.fsHandle, prefix = '', depth = 0) {
  const treeContainer = document.getElementById('file-tree');
  if (!treeContainer || !handle) return;
  if (depth === 0) treeContainer.textContent = '';

  const lines = [];
  try {
    for await (const [name, h] of handle.entries()) {
      const pad = '  '.repeat(depth);
      const typeLabel = h.kind === 'directory' ? '/' : '';
      lines.push(`${pad}${prefix}${name}${typeLabel}`);

      if (h.kind === 'directory' && depth < 2) {
        const sub = [];
        for await (const [n2, h2] of h.entries()) {
          sub.push(`${pad}  ${n2}${h2.kind === 'directory' ? '/' : ''}`);
        }
        lines.push(sub.slice(0, 10).join('\n'));
        if (sub.length > 10) lines.push(`${pad}  … (+${sub.length - 10} fichiers)`);
      }
    }
    if (depth === 0) {
      treeContainer.textContent = lines.join('\n') || '// Dossier vide';
    }
  } catch (e) {
    treeContainer.textContent = '// Erreur de lecture de l\'arborescence';
  }
}

export function showDiff(path, oldContent, newContent) {
  const container = document.getElementById('diff-viewer-list');
  if (!container) return;

  const oldLines = (oldContent || '').split('\n');
  const newLines = (newContent || '').split('\n');

  const card = document.createElement('div');
  card.className = 'diff-card';

  card.innerHTML = `
    <div class="diff-card-header">
      <div style="display: flex; align-items: center; gap: 6px;">
        ${ICONS.fileCode}
        <span>${escapeHtml(path)}</span>
      </div>
      <span style="font-size: 10px; color: var(--text-muted);">Proposé par l'agent</span>
    </div>
    <div class="diff-lines-wrapper"></div>
    <div class="diff-card-actions">
      <button class="btn btn-primary" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px;">
        ${ICONS.check}
        <span>Appliquer</span>
      </button>
      <button class="btn btn-ghost" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 4px;">
        ${ICONS.x}
        <span>Rejeter</span>
      </button>
    </div>
  `;

  const linesWrapper = card.querySelector('.diff-lines-wrapper');
  const max = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      linesWrapper.innerHTML += `<div style="color: var(--text-muted); padding: 0 4px;">  ${escapeHtml(o || '')}</div>`;
    } else {
      if (o !== undefined) linesWrapper.innerHTML += `<div class="diff-line-del">- ${escapeHtml(o)}</div>`;
      if (n !== undefined) linesWrapper.innerHTML += `<div class="diff-line-add">+ ${escapeHtml(n)}</div>`;
    }
  }

  // Action handlers
  const [btnApply, btnReject] = card.querySelectorAll('.diff-card-actions button');
  btnApply.onclick = async () => {
    if (!state.fsHandle) {
      alert("Veuillez d'abord connecter un dossier local dans le Sandbox.");
      return;
    }
    try {
      const parts = path.split('/');
      let h = state.fsHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        h = await h.getDirectoryHandle(parts[i], { create: true });
      }
      const fh = await h.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(newContent);
      await w.close();
      agentLog(`Fichier modifié avec succès : ${path}`);
      card.style.borderColor = 'var(--color-success)';
      btnApply.disabled = true;
      btnApply.innerHTML = `${ICONS.check} <span>Appliqué</span>`;
    } catch (e) {
      agentLog(`Échec écriture : ${e.message}`);
    }
  };

  btnReject.onclick = () => card.remove();

  container.prepend(card);
  openArtifactsPanel('sandbox');
}

export function agentLog(msg) {
  const terminal = document.getElementById('agent-terminal-log');
  if (terminal) {
    terminal.textContent += `\n[${new Date().toLocaleTimeString()}] > ${msg}`;
    terminal.scrollTop = terminal.scrollHeight;
  }
}

function renderSkillsTab() {
  const listEl = document.getElementById('skills-list-container');
  if (!listEl) return;
  const skills = getSkills();
  listEl.innerHTML = skills.map(s => `
    <div class="skill-card">
      <div class="skill-header">
        <div style="display: flex; align-items: center; gap: 6px;">
          ${ICONS.zap}
          <span>${escapeHtml(s.name)}</span>
        </div>
        <span class="badge badge-ok">Actif</span>
      </div>
      <div class="skill-desc">${escapeHtml(s.description)}</div>
    </div>
  `).join('');
}

async function renderKBTab() {
  const listEl = document.getElementById('kb-documents-list');
  if (!listEl) return;
  const docs = await dbGetAll('documents');
  if (docs.length === 0) {
    listEl.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 20px;">Aucun document dans la bibliothèque locale.</div>';
    return;
  }
  listEl.innerHTML = '';
  docs.forEach(d => {
    const item = document.createElement('div');
    item.className = 'kb-document-item';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'space-between';
    item.style.padding = '8px 10px';
    item.style.background = 'var(--bg-surface)';
    item.style.borderRadius = 'var(--radius-sm)';
    item.style.border = '1px solid var(--border-subtle)';

    item.innerHTML = `
      <div style="flex: 1; min-width: 0; margin-right: 8px;">
        <div style="font-weight: 500; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(d.title)}</div>
        <div class="kb-doc-source" style="font-size: 11px; color: var(--text-muted);">${escapeHtml(d.source || 'Local')} · ${new Date(d.ts || Date.now()).toLocaleDateString()}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="badge badge-accent">Indexé</span>
        <button class="history-action-btn delete btn-del-doc" title="Supprimer ce document" style="padding: 4px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: 4px;">
          ${ICONS.trash}
        </button>
      </div>
    `;

    const btnDel = item.querySelector('.btn-del-doc');
    btnDel?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await confirmModal({
        title: 'Supprimer le document',
        message: `Supprimer « ${d.title} » et ses fragments indexés ?`,
        confirmText: 'Supprimer',
        danger: true
      });
      if (confirmed) {
        await deleteDocument(d.id);
        await refreshKBStats();
        await renderKBTab();
        showToast(`Document "${d.title}" supprimé.`, 'info');
      }
    });

    listEl.appendChild(item);
  });
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
