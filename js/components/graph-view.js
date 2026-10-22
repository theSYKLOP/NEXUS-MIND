/* ==========================================================================
   NEXUS-MIND — GRAPHIFY (Cytoscape Mental Map Component)
   ========================================================================== */

import { state, notify } from '../state.js';

let cyInstance = null;

export function initGraphView(containerEl) {
  if (!containerEl || !window.cytoscape) return;

  cyInstance = window.cytoscape({
    container: containerEl,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#4e75f6',
          'label': 'data(label)',
          'color': '#f1f3f7',
          'font-family': 'Inter, sans-serif',
          'font-size': 11,
          'font-weight': 500,
          'text-valign': 'center',
          'text-halign': 'center',
          'width': 36,
          'height': 36,
          'border-width': 2,
          'border-color': '#14161c',
          'overlay-padding': 4,
          'transition-property': 'background-color, border-color, transform',
          'transition-duration': '0.2s'
        }
      },
      {
        selector: 'node[type="file"]',
        style: {
          'background-color': '#ef4444',
          'shape': 'round-rectangle',
          'width': 42,
          'height': 30
        }
      },
      {
        selector: 'node[type="task"]',
        style: {
          'background-color': '#f59e0b',
          'shape': 'diamond',
          'width': 40,
          'height': 40
        }
      },
      {
        selector: 'node[type="concept"]',
        style: {
          'background-color': '#8b5cf6',
          'shape': 'ellipse'
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-color': '#ffffff',
          'border-width': 3,
          'shadow-blur': 15,
          'shadow-color': '#4e75f6',
          'shadow-opacity': 0.8
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': 'rgba(255, 255, 255, 0.2)',
          'target-arrow-color': 'rgba(255, 255, 255, 0.35)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'label': 'data(label)',
          'font-size': 9,
          'color': '#9da4b4',
          'text-rotation': 'autorotate',
          'text-background-opacity': 0.8,
          'text-background-color': '#090a0d',
          'text-background-padding': 2,
          'text-background-shape': 'round-rectangle'
        }
      }
    ],
    layout: {
      name: 'cose',
      animate: true,
      animationDuration: 500,
      randomize: false,
      componentSpacing: 60,
      nodeRepulsion: 4500
    },
    wheelSensitivity: 0.3
  });

  state.graph = cyInstance;
  updateGraphStats();
}

export function extractGraphData(text) {
  if (!text) return null;
  const re = /```graph\s*([\s\S]*?)```/g;
  let match;
  let lastData = null;
  while ((match = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.nodes || parsed.edges) {
        mergeGraph(parsed);
        lastData = parsed;
      }
    } catch (e) {
      console.warn('[NEXUS Graphify] JSON de graphe non valide:', e);
    }
  }
  return lastData;
}

export function mergeGraph(data) {
  if (!cyInstance || !data) return;

  if (Array.isArray(data.nodes)) {
    data.nodes.forEach(n => {
      if (n.id && !cyInstance.getElementById(n.id).length) {
        cyInstance.add({
          group: 'nodes',
          data: {
            id: String(n.id),
            label: n.label || String(n.id),
            type: n.type || 'concept'
          }
        });
      }
    });
  }

  if (Array.isArray(data.edges)) {
    data.edges.forEach((e, idx) => {
      const edgeId = `e_${e.source}_${e.target}_${idx}`;
      if (e.source && e.target && !cyInstance.getElementById(edgeId).length) {
        cyInstance.add({
          group: 'edges',
          data: {
            id: edgeId,
            source: String(e.source),
            target: String(e.target),
            label: e.label || ''
          }
        });
      }
    });
  }

  // Refresh layout smoothly
  cyInstance.layout({ name: 'cose', animate: true, animationDuration: 350 }).run();
  updateGraphStats();
}

export function fitGraph() {
  if (cyInstance) {
    cyInstance.fit(undefined, 40);
  }
}

export function exportGraphJSON() {
  if (!cyInstance) return;
  const json = cyInstance.json();
  const blob = new Blob([JSON.stringify(json.elements, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus_mind_map_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function updateGraphStats() {
  const statsEl = document.getElementById('graph-stats-label');
  if (statsEl && cyInstance) {
    const nodesCount = cyInstance.nodes().length;
    const edgesCount = cyInstance.edges().length;
    statsEl.textContent = `${nodesCount} concept${nodesCount > 1 ? 's' : ''} · ${edgesCount} relation${edgesCount > 1 ? 's' : ''}`;
  }
}
