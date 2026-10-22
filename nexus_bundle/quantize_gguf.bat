@echo off
REM === RECETTE DE QUANTIFICATION GGUF (llama.cpp) ===
echo [1/3] Telechargement du modele de base HuggingFace : Qwen/Qwen2.5-0.5B-Instruct...
git clone https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct base_model

echo [2/3] Conversion en GGUF FP16...
python llama.cpp/convert_hf_to_gguf.py base_model --outfile model_fp16.gguf

echo [3/3] Quantification en Q4F16_1...
llama.cpp/llama-quantize model_fp16.gguf model_q4f16_1.gguf Q4F16_1

echo [OK] Modele GGUF quantifie : model_q4f16_1.gguf
pause
