/* ==========================================================================
   NEXUS-MIND — SKILLS & MCP EXTENSION SYSTEM
   ========================================================================== */

import { state, notify } from './state.js';

export const skillsRegistry = [];

export function registerSkill(name, description, fn) {
  // Replace if existing with same name
  const existingIdx = skillsRegistry.findIndex(s => s.name === name);
  const skillObj = { name, description, fn };
  if (existingIdx >= 0) {
    skillsRegistry[existingIdx] = skillObj;
  } else {
    skillsRegistry.push(skillObj);
  }
  notify('skills:updated', skillsRegistry);
  return skillObj;
}

export function getSkills() {
  return [...skillsRegistry];
}

export async function runSkills(query) {
  const results = [];
  const context = {
    state,
    fs: state.fsHandle
  };

  for (const skill of skillsRegistry) {
    try {
      const output = await skill.fn(query, context);
      if (output) {
        results.push(`[SKILL: ${skill.name}]\n${output}`);
      }
    } catch (err) {
      console.warn(`[NEXUS Skill Warning] ${skill.name}:`, err);
    }
  }
  return results.join('\n\n');
}

// Preset Default Skills
registerSkill(
  'web-search-sim',
  'Simulateur de recherche web (extensible avec API Tavily / Serper / MCP)',
  async (query) => {
    if (!/recherche|search|web|trouve sur le net/i.test(query)) return null;
    return `Simulation de recherche pour "${query}":\n- Résultat 1 : Documentation officielle WebGPU & WebLLM\n- Résultat 2 : Bonnes pratiques d'architecture Local-First`;
  }
);

registerSkill(
  'fs-json-analyzer',
  'Analyse les fichiers JSON et configs du dossier local connecté',
  async (query, ctx) => {
    if (!ctx.fs) return null;
    if (!/analyse.*json|package\.json|tsconfig|config/i.test(query)) return null;
    try {
      for await (const [name, handle] of ctx.fs.entries()) {
        if (name.endsWith('.json') && handle.kind === 'file') {
          const file = await handle.getFile();
          const content = await file.text();
          return `Fichier détecté : ${name} (${content.length} octets)\nAperçu :\n${content.slice(0, 300)}...`;
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }
);
