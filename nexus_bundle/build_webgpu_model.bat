@echo off
REM === RECETTE DE QUANTIFICATION ET COMPILATION MLC-LLM WEBGPU ===
echo [1/3] Installation des outils MLC-LLM...
pip install --pre --extra-index-url https://packages.mlc.ai/wheels mlc-llm mlc-ai-nightly

echo [2/3] Quantification du modele en q4f16_1...
python -m mlc_llm convert_weight --model-id Qwen/Qwen2.5-0.5B-Instruct --quantization q4f16_1 --output ./dist/Qwen2.5-0.5B-Instruct-q4f16_1

echo [3/3] Generation des artefacts WebGPU (.wasm et shards)...
python -m mlc_llm gen_wasm --model-id ./dist/Qwen2.5-0.5B-Instruct-q4f16_1 --output ./dist/Qwen2.5-0.5B-Instruct-q4f16_1-webgpu.wasm

echo [OK] Modele quantifie et pret a etre charge dans index.html !
pause
