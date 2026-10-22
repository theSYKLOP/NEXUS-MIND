#!/usr/bin/env python3
"""
NEXUS-MIND — Studio de Distillation & Quantification Locale (One-Shot Engine)
Transforme un corpus volumineux (code, docs, spécifications) en :
  1. Base de connaissances distillée (knowledge_base.json) pour RAG local.
  2. Données synthétiques d'alignement (instruction distillation via Teacher LLM).
  3. Recettes et configurations de quantification 4-bit (MLC WebGPU & GGUF).

Modes disponibles :
  - context    : Distillation contextuelle et extraction de concepts (pour le RAG frontend)
  - synth-qa   : Génération de paires Question/Réponse/Raisonnement via Teacher local
  - quant-mlc  : Préparation et configuration de quantification MLC-LLM WebGPU (q4f16_1)
  - quant-gguf : Recette de quantification GGUF (llama.cpp)
  - all        : Exécute la chaîne complète de distillation et de quantification

Usage :
  python distill_engine.py --mode context --input ./mon_projet --output knowledge_base.json
  python distill_engine.py --mode synth-qa --input ./mon_projet --teacher qwen2.5:7b --output dataset.jsonl
  python distill_engine.py --mode quant-mlc --student Qwen/Qwen2.5-0.5B-Instruct --quant q4f16_1
  python distill_engine.py --mode all --input ./mon_projet --output ./nexus_bundle
"""

import os
import re
import sys
import json
import hashlib
import argparse
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

# Extensions cibles pour l'analyse de corpus
SUPPORTED_EXTENSIONS = {
    '.md', '.txt', '.json', '.js', '.ts', '.jsx', '.tsx',
    '.py', '.html', '.css', '.yaml', '.yml', '.toml', '.rs',
    '.go', '.java', '.c', '.cpp', '.h', '.sh', '.sql'
}

# Heuristiques d'extraction syntaxique
PATTERNS = {
    'function':   re.compile(r'(?:function|def|fn|func)\s+([A-Za-z_]\w*)'),
    'class':      re.compile(r'(?:class|interface|struct|enum)\s+([A-Za-z_]\w*)'),
    'constant':   re.compile(r'(?:const|let|var|static final)\s+([A-Z_][A-Z0-9_]{2,})'),
    'import':     re.compile(r'(?:import|from|require)\s+["\']?([@\w\./\-]+)["\']?'),
    'heading':    re.compile(r'^#{1,3}\s+(.+)$', re.MULTILINE),
    'endpoint':   re.compile(r'(?:GET|POST|PUT|DELETE|PATCH)\s+["\'](/[^"\']+)["\']'),
    'env':        re.compile(r'process\.env\.([A-Z_]+)|os\.environ\[["\']([A-Z_]+)["\']\]'),
}


@dataclass
class KBEntry:
    id: str
    title: str
    type: str  # concept | rule | snippet | api | config
    content: str
    source: str
    tags: List[str]
    score: float = 1.0


class Logger:
    @staticmethod
    def info(msg: str):
        print(f"[INFO] {msg}")

    @staticmethod
    def ok(msg: str):
        print(f"[OK]   {msg}")

    @staticmethod
    def warn(msg: str):
        print(f"[WARN] {msg}")

    @staticmethod
    def error(msg: str):
        print(f"[ERR]  {msg}")

    @staticmethod
    def step(title: str):
        print(f"\n=== {title} ===")


# ==============================================================================
# 1. MOTEUR DE DISTILLATION CONTEXTUELLE
# ==============================================================================

class ContextDistiller:
    def __init__(self, use_teacher: bool = False, teacher_model: str = "qwen2.5:7b"):
        self.use_teacher = use_teacher
        self.teacher_model = teacher_model
        self.entries: List[KBEntry] = []
        self.seen_hashes = set()

    def _hash(self, text: str) -> str:
        return hashlib.sha1(text.encode('utf-8')).hexdigest()[:12]

    def _add_entry(self, title: str, type_: str, content: str, source: str, tags: List[str], score: float = 1.0):
        h = self._hash(content)
        if h in self.seen_hashes:
            return
        self.seen_hashes.add(h)
        self.entries.append(KBEntry(
            id=h,
            title=title,
            type=type_,
            content=content.strip()[:2500],
            source=source,
            tags=tags,
            score=score
        ))

    def scan_file(self, path: Path):
        try:
            text = path.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            Logger.warn(f"Fichier ignore {path.name}: {e}")
            return

        rel_path = str(path)
        ext = path.suffix

        # Chunks avec chevauchement
        if len(text) > 200:
            chunks = [text[i:i+800] for i in range(0, min(len(text), 12000), 720)]
            for i, chunk in enumerate(chunks[:6]):
                self._add_entry(
                    title=f"{path.name}#{i+1}",
                    type_="snippet",
                    content=chunk,
                    source=rel_path,
                    tags=[ext, path.stem],
                    score=0.7
                )

        # Extraction par motifs regex
        for ptype, regex in PATTERNS.items():
            matches = regex.findall(text)
            for m in matches[:15]:
                name = m if isinstance(m, str) else (m[0] or m[1])
                self._add_entry(
                    title=f"{ptype}:{name}",
                    type_="concept",
                    content=f"Element {ptype} '{name}' documente dans {path.name}.",
                    source=rel_path,
                    tags=[ptype, ext, name.lower()],
                    score=1.4 if ptype in ('class', 'function') else 0.9
                )

        # Documentation et regles d'architecture
        if path.name.lower() in ('readme.md', 'architecture.md', 'contributing.md', 'design.md'):
            self._add_entry(
                title=f"doc:{path.name}",
                type_="rule",
                content=text[:3500],
                source=rel_path,
                tags=['architecture', 'doc'],
                score=2.5
            )

        # Fichiers de configuration
        if ext in ('.json', '.yaml', '.yml', '.toml') and path.stat().st_size < 60000:
            self._add_entry(
                title=f"config:{path.name}",
                type_="config",
                content=text[:2500],
                source=rel_path,
                tags=['config', ext],
                score=1.6
            )

    def scan_directory(self, root: Path, ignore_dirs=None):
        ignore_dirs = ignore_dirs or {'.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build', '.idea'}
        file_count = 0
        for path in root.rglob('*'):
            if any(part in path.parts for part in ignore_dirs):
                continue
            if path.is_file() and path.suffix in SUPPORTED_EXTENSIONS:
                self.scan_file(path)
                file_count += 1
                if file_count % 50 == 0:
                    Logger.info(f"Analyse en cours : {file_count} fichiers analyses...")
        Logger.ok(f"Scan complete : {file_count} fichiers traites, {len(self.entries)} entrees generees.")

    def enrich_with_ollama(self):
        """Enrichit les entrees importantes en utilisant un LLM local via Ollama."""
        if not self.use_teacher:
            return
        try:
            import requests
        except ImportError:
            Logger.warn("Le package 'requests' est requis pour l'enrichissement Ollama. 'pip install requests'")
            return

        Logger.info(f"Connexion a Ollama ({self.teacher_model}) pour enrichissement conceptuel...")
        top_entries = sorted(self.entries, key=lambda e: -e.score)[:25]
        enriched_count = 0

        for entry in top_entries:
            if entry.type != 'snippet':
                continue
            prompt = (
                f"Synthetise de facon ultra-dense en 1 phrase l'intention architecturale et le role de ce composant :\n\n"
                f"{entry.content[:500]}"
            )
            try:
                res = requests.post(
                    "http://localhost:11434/api/generate",
                    json={"model": self.teacher_model, "prompt": prompt, "stream": False},
                    timeout=15
                )
                if res.status_code == 200:
                    summary = res.json().get('response', '').strip()
                    if summary:
                        entry.content = f"SYNTHESE: {summary}\n\nEXTRAIT:\n{entry.content}"
                        entry.score *= 1.4
                        enriched_count += 1
            except Exception as e:
                Logger.warn(f"Ollama timeout ou erreur : {e}")
                break

        Logger.ok(f"{enriched_count} entrees enrichies avec succes par le modele Enseignant.")

    def export_json(self, output_path: Path):
        self.entries.sort(key=lambda e: -e.score)
        data = {
            "meta": {
                "generator": "nexusmind-distill-engine-v2",
                "version": "2.0",
                "total_entries": len(self.entries),
                "total_chars": sum(len(e.content) for e in self.entries)
            },
            "entries": [asdict(e) for e in self.entries[:600]]
        }
        output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        size_kb = output_path.stat().st_size / 1024
        Logger.ok(f"Fichier de connaissances genere : {output_path} ({len(data['entries'])} entrees, {size_kb:.1f} KB)")


# ==============================================================================
# 2. MOTEUR DE DISTILLATION D'INSTRUCTIONS (Synthetic QA Generator)
# ==============================================================================

class SyntheticQADistiller:
    def __init__(self, teacher_model: str = "qwen2.5:7b"):
        self.teacher_model = teacher_model

    def generate_dataset(self, kb_path: Path, output_file: Path, max_pairs: int = 50):
        try:
            import requests
        except ImportError:
            Logger.error("Le module 'requests' est requis. Lancez: pip install requests")
            return

        if not kb_path.exists():
            Logger.error(f"Fichier KB inexistant : {kb_path}")
            return

        kb_data = json.loads(kb_path.read_text(encoding='utf-8'))
        entries = kb_data.get('entries', [])[:max_pairs]

        Logger.info(f"Generation de {len(entries)} paires d'instructions synthetiques via {self.teacher_model}...")
        dataset = []

        for i, entry in enumerate(entries):
            prompt = (
                f"A partir du contexte technique suivant, genere une question d'ingenieur realiste et la reponse technique experte associee.\n"
                f"Format de reponse JSON STRICT : {{\"question\": \"...\", \"reasoning\": \"...\", \"answer\": \"...\"}}\n\n"
                f"CONTEXTE:\n{entry['content'][:700]}"
            )
            try:
                res = requests.post(
                    "http://localhost:11434/api/generate",
                    json={"model": self.teacher_model, "prompt": prompt, "format": "json", "stream": False},
                    timeout=30
                )
                if res.status_code == 200:
                    raw = res.json().get('response', '')
                    item = json.loads(raw)
                    dataset.append({
                        "id": f"qa_{i+1}",
                        "source": entry['source'],
                        "instruction": item.get('question', ''),
                        "thought": item.get('reasoning', ''),
                        "output": item.get('answer', '')
                    })
                    Logger.info(f"Paire {i+1}/{len(entries)} generee.")
            except Exception as e:
                Logger.warn(f"Erreur sur element {i+1}: {e}")

        # Export JSONL
        with open(output_file, 'w', encoding='utf-8') as f:
            for item in dataset:
                f.write(json.dumps(item, ensure_ascii=False) + '\n')

        Logger.ok(f"Jeu de donnees d'alignement genere : {output_file} ({len(dataset)} exemples)")


# ==============================================================================
# 3. MOTEUR DE RECETTES & QUANTIFICATION 4-BIT (WebGPU MLC & GGUF)
# ==============================================================================

class ModelQuantizer:
    @staticmethod
    def generate_mlc_config(student_model: str, quant_format: str, output_dir: Path):
        """Genere la configuration d'export pour MLC-LLM WebGPU (WebLLM)."""
        output_dir.mkdir(parents=True, exist_ok=True)
        config_path = output_dir / "mlc-chat-config.json"
        recipe_path = output_dir / "build_webgpu_model.bat"

        # Configuration de chat MLC
        chat_config = {
            "model_type": student_model.split('/')[-1].lower(),
            "quantization": quant_format,
            "model_lib": f"{student_model.split('/')[-1]}-{quant_format}-webgpu.wasm",
            "temperature": 0.4,
            "repetition_penalty": 1.1,
            "top_p": 0.9,
            "conv_template": "qwen2" if "qwen" in student_model.lower() else "llama-3",
            "context_window_size": 4096,
            "prefill_chunk_size": 1024
        }
        config_path.write_text(json.dumps(chat_config, indent=2), encoding='utf-8')

        # Script de compilation local pour le developpeur
        cmd_script = f"""@echo off
REM === RECETTE DE QUANTIFICATION ET COMPILATION MLC-LLM WEBGPU ===
echo [1/3] Installation des outils MLC-LLM...
pip install --pre --extra-index-url https://packages.mlc.ai/wheels mlc-llm mlc-ai-nightly

echo [2/3] Quantification du modele en {quant_format}...
python -m mlc_llm convert_weight --model-id {student_model} --quantization {quant_format} --output ./dist/{student_model.split('/')[-1]}-{quant_format}

echo [3/3] Generation des artefacts WebGPU (.wasm et shards)...
python -m mlc_llm gen_wasm --model-id ./dist/{student_model.split('/')[-1]}-{quant_format} --output ./dist/{student_model.split('/')[-1]}-{quant_format}-webgpu.wasm

echo [OK] Modele quantifie et pret a etre charge dans index.html !
pause
"""
        recipe_path.write_text(cmd_script, encoding='utf-8')
        Logger.ok(f"Configuration MLC-LLM generee : {config_path}")
        Logger.ok(f"Script de quantification WebGPU genere : {recipe_path}")

    @staticmethod
    def generate_gguf_recipe(student_model: str, quant_type: str, output_dir: Path):
        """Genere la recette de quantification GGUF via llama.cpp."""
        output_dir.mkdir(parents=True, exist_ok=True)
        recipe_path = output_dir / "quantize_gguf.bat"

        script = f"""@echo off
REM === RECETTE DE QUANTIFICATION GGUF (llama.cpp) ===
echo [1/3] Telechargement du modele de base HuggingFace : {student_model}...
git clone https://huggingface.co/{student_model} base_model

echo [2/3] Conversion en GGUF FP16...
python llama.cpp/convert_hf_to_gguf.py base_model --outfile model_fp16.gguf

echo [3/3] Quantification en {quant_type.upper()}...
llama.cpp/llama-quantize model_fp16.gguf model_{quant_type.lower()}.gguf {quant_type.upper()}

echo [OK] Modele GGUF quantifie : model_{quant_type.lower()}.gguf
pause
"""
        recipe_path.write_text(script, encoding='utf-8')
        Logger.ok(f"Recette GGUF generee : {recipe_path}")


# ==============================================================================
# 4. POINT D'ENTRÉE & CLI ORCHESTRATION
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="NEXUS-MIND — Studio de Distillation & Quantification Locale (One-Shot Engine)",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--mode", "-m",
        choices=['context', 'synth-qa', 'quant-mlc', 'quant-gguf', 'all'],
        default='context',
        help="Mode operatoire (context, synth-qa, quant-mlc, quant-gguf, all)"
    )
    parser.add_argument("--input", "-i", default="./", help="Dossier source a analyser")
    parser.add_argument("--output", "-o", default="knowledge_base.json", help="Fichier ou dossier de sortie")
    parser.add_argument("--teacher", "-t", default="qwen2.5:7b", help="Modele Enseignant Ollama (ex: qwen2.5:7b)")
    parser.add_argument("--student", "-s", default="Qwen/Qwen2.5-0.5B-Instruct", help="Modele Etudiant HuggingFace cible")
    parser.add_argument("--quant", "-q", default="q4f16_1", help="Format de quantification (q4f16_1, q4f32_1, q4_k_m)")
    args = parser.parse_args()

    Logger.step("NEXUS-MIND DISTILLATION & QUANTIZATION STUDIO")

    # Mode 1 : Distillation contextuelle
    if args.mode in ('context', 'all'):
        Logger.info(f"Execution de la distillation contextuelle sur '{args.input}'...")
        distiller = ContextDistiller(use_teacher=(args.mode == 'all'), teacher_model=args.teacher)
        distiller.scan_directory(Path(args.input))
        if args.mode == 'all':
            distiller.enrich_with_ollama()
        
        kb_out = Path(args.output if args.mode == 'context' else Path(args.output) / "knowledge_base.json")
        kb_out.parent.mkdir(parents=True, exist_ok=True)
        distiller.export_json(kb_out)

    # Mode 2 : Paires QA Synthetiques
    if args.mode == 'synth-qa':
        qa_out = Path(args.output)
        qa_engine = SyntheticQADistiller(teacher_model=args.teacher)
        qa_engine.generate_dataset(Path("knowledge_base.json"), qa_out)

    # Mode 3 : Recettes de quantification MLC WebGPU
    if args.mode in ('quant-mlc', 'all'):
        out_dir = Path(args.output) if args.mode != 'context' else Path("./quant_output")
        ModelQuantizer.generate_mlc_config(args.student, args.quant, out_dir)

    # Mode 4 : Recettes de quantification GGUF
    if args.mode in ('quant-gguf', 'all'):
        out_dir = Path(args.output) if args.mode != 'context' else Path("./quant_output")
        ModelQuantizer.generate_gguf_recipe(args.student, args.quant if 'q4' in args.quant else 'Q4_K_M', out_dir)

    Logger.step("OPERATION TERMINEE AVEC SUCCES")


if __name__ == "__main__":
    main()