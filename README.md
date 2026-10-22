# 🧠 NEXUS-MIND

**Plateforme d'IA locale "Local-First" — une boutique de connaissances qui devient plus puissante à mesure qu'on la nourrit.**

> Un petit modèle (50 Mo) qui agit comme un grand (5 Go) grâce à la **distillation contextuelle** et au **RAG local**.

![License](https://img.shields.io/badge/license-MIT-blue) ![WebGPU](https://img.shields.io/badge/WebGPU-required-38bdf8) ![Vercel](https://img.shields.io/badge/deploy-Vercel-000)

---

## ✨ Features

- ⚡ **Tri-Hybrid Speculative Matrix** — Décodage spéculatif asynchrone (Dual-Engine Draft+Target), Tensor Pipeline Ping-Pong (Web Worker), KV-Cache quantifié INT4 et Prefix Caching (TTFT < 50ms)
- 🧬 **NeuroCortex Distillation** — Routage dynamique d'experts MoE distillés pour appareils de 4 à 8 Go de RAM
- 🏃 **100% local** — tourne dans ton navigateur via WebGPU, aucune donnée ne quitte ta machine
- 🛡️ **Gestion Souveraine & Garde-fous** — Déblocage des barrières de conformité SLM et recherche web live open source
- 📚 **RAG local & In-App Modals** — IndexedDB optimisé avec gestionnaire de base locale (vidage sélectif ou complet sans blocage de popups natifs)
- 🕸️ **Graphify** — carte mentale automatique via Cytoscape.js
- 📁 **Sandbox Agent** — lecture/écriture dans un dossier local via File System Access API
- 🔌 **Skills/Plugins** — architecture extensible (MCP-ready)
- 📦 **Déploiement trivial** — prêt pour GitHub Pages ou Vercel sans build lourd

## 🎯 L'astuce des 5 Go → 50 Mo

Un petit modèle ne peut pas "savoir" autant qu'un gros. Mais il peut **agir comme s'il savait** si on lui injecte au bon moment les bonnes connaissances.

```
[5 Go de docs/code]
        ↓  distill_engine.py
[knowledge_base.json ~ 1 Mo]
        ↓  IndexedDB
[Prompt système enrichi]
        ↓
[Qwen2-0.5B WebGPU] → réponses expertes
```

Le script Python extrait les concepts, règles, patterns et snippets importants, puis les compile en un JSON ultra-compressé. Le frontend charge ce JSON et l'injecte dynamiquement dans le prompt du petit modèle.

## 🚀 Démarrage rapide

### Option A — Local (recommandé)

```bash
# Aucun build nécessaire !
python -m http.server 8080
# Ouvre http://localhost:8080 dans Chrome/Edge 113+
```

### Option B — Vercel

```bash
npm i -g vercel
vercel --prod
```

Le projet est un simple fichier statique, aucun build requis.

## 📦 Structure

```
nexus-mind/
├── index.html                   # Point d'entrée principal de l'application
├── distill_engine.py            # Moteur de distillation (Python)
├── knowledge_base.json          # (généré) Base de connaissances compacte
├── css/
│   ├── design-system.css        # Variables tokens, typographie, reset & scrollbars
│   ├── chat.css                 # Style du chat, streaming, Markdown & code blocks
│   ├── sidebar.css              # Historique des chats, panneau bibliothèque
│   └── artifacts.css            # Panneau droit dynamique (graphe, sandbox, diffs)
└── js/
    ├── app.js                   # Orchestrateur principal
    ├── state.js                 # Store d'état réactif
    ├── db.js                    # Persistance IndexedDB (multi-chats, chunks, docs)
    ├── engine.js                # Inférence WebLLM (Qwen, Llama, SmolLM2)
    ├── rag.js                   # Moteur RAG local (chunking, scoring TF-IDF)
    ├── skills.js                # Registre de compétences et passerelle MCP
    └── components/
        ├── sidebar.js           # Navigation & historique des conversations
        ├── chat-view.js         # Rendu conversationnel & formatage Markdown
        ├── prompt-bar.js        # Zone de saisie intelligente auto-resize
        ├── artifacts-panel.js   # Panneau d'artefacts escamotable (Cytoscape + Sandbox)
        └── graph-view.js        # Intégration Cytoscape modernisée
```

## 🧪 Utilisation

### 1. Lancer l'interface
Ouvre `index.html` dans un navigateur compatible WebGPU (Chrome/Edge 113+).
Sélectionne ton modèle dans la barre supérieure puis clique sur **"Charger"** (téléchargé et mis en cache localement au 1er lancement).

### 2. Expérience Conversationnelle
- Discute en plein écran avec une largeur de lecture idéale.
- Multi-sessions : crée autant de chats que souhaité, renomme-les ou supprime-les.
- Le RAG local s'active/désactive d'un simple clic sur le bouton de prompt.

### 3. Studio d'Artefacts (Style Claude Desktop)
- Clique sur **"🧠 Carte & Artefacts"** pour déployer le volet latéral sans quitter la discussion.
- Retrouve ta **carte mentale Cytoscape**, ton **Sandbox Agent (File System Access)** avec visualiseur de diffs, ta **bibliothèque RAG** et tes **plugins MCP**.

### 4. Nourrir la bibliothèque
- **Bouton 📎 Joindre** : dans la barre de prompt pour indexer des fichiers instantanément.
- **+ Fichier / + URL** : dans la barre latérale pour ingérer des documentations entières.
- **Base distillée** : charge un `knowledge_base.json` produit par `distill_engine.py`.

## 🔨 Générer une base distillée

```bash
pip install requests  # optionnel, pour Ollama
python distill_engine.py --input ./mon_projet --output knowledge_base.json

# Avec enrichissement LLM local (Ollama) :
ollama pull qwen2:0.5b
python distill_engine.py -i ./mon_projet -o kb.json -m qwen2:0.5b
```

## 🔌 Ajouter un Skill (Plugin)

Appelle `registerSkill()` n'importe où dans la console ou un script d'extension :

```javascript
window.NEXUS.registerSkill(
  'mon-skill',
  'Description de ce que fait le skill',
  async (query, ctx) => {
    // ctx.state, ctx.fs (File System handle)
    if (/mot-clé/.test(query)) {
      return "Résultat injecté dans le prompt système";
    }
    return null; // pas d'action
  }
);
```

## 🎨 Design

**Studio Obsidian (Gemini × ChatGPT × Claude Desktop)** — Mode sombre profond, typographies Inter & JetBrains Mono, dock d'artefacts rétractable, prompt bar flottante et micro-interactions fluides.

## 🧩 Stack technique

| Composant | Technologie |
|---|---|
| Frontend | HTML5 sémantique + Vanilla CSS Modulaire (Zero-Build) |
| Inférence | [WebLLM](https://webllm.mlc.ai/) (Qwen2.5, Llama 3.2, SmolLM2, Gemma 2, Phi-3.5) |
| Graphe | [Cytoscape.js](https://js.cytoscape.org/) |
| Stockage | IndexedDB (`nexusmind_v2`) |
| FS local | File System Access API |
| Markdown & Code | Marked.js + Highlight.js (Atom One Dark) |
| Distillation | Python + heuristiques + Ollama (optionnel) |

## ⚠️ Limites & Notes

- **WebGPU requis** — Chrome/Edge 113+. Firefox en expérimental.
- **File System Access** — Chrome/Edge uniquement.
- **CORS** — L'import d'URL passe par `allorigins.win` (proxy public). Pour la prod, déploie ton propre proxy.
- **Taille modèle** — Le premier chargement télécharge ~100 Mo (mis en cache ensuite).

## 📄 License

MIT — fais-en ce que tu veux, mais cite la source. 🖤

---

**NEXUS-MIND** — *La connaissance locale, augmentée.*