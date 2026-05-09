import io
import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import torch
import librosa
from transformers import pipeline
from dotenv import load_dotenv

# Load environment variables from .env.local if present (development)
load_dotenv(".env.local")

# Strictly use INFERENCE_KEY and INFERENCE_SECRET
# These are provided by Modal Secrets in production
def get_auth_config():
    return os.environ.get("INFERENCE_KEY"), os.environ.get("INFERENCE_SECRET")

app = FastAPI(title="Shadowly Inference API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache
models = {}

def get_models():
    if not models:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading models on {device}...")
        
        models["whisper"] = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-large-v3-turbo",
            device=device,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        )
        
        models["wav2vec2"] = pipeline(
            "automatic-speech-recognition",
            model="facebook/wav2vec2-lv-60-espeak-cv-ft",
            device=device,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        )
    return models

async def verify_headers(request: Request):
    auth_key, auth_secret = get_auth_config()
    key = request.headers.get("X-Shadowly-Key")
    secret = request.headers.get("X-Shadowly-Secret")
    
    if not auth_key or not auth_secret or key != auth_key or secret != auth_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/health")
async def health():
    return {"status": "ok", "device": "cuda" if torch.cuda.is_available() else "cpu"}

@app.post("/transcribe")
async def transcribe(audio_file: UploadFile = File(...), _ = Depends(verify_headers)):
    try:
        audio_bytes = await audio_file.read()
        audio, _ = librosa.load(io.BytesIO(audio_bytes), sr=16000)
        
        inference = get_models()["whisper"]
        result = inference(audio, return_timestamps="word")
        
        word_timestamps = []
        for chunk in result["chunks"]:
            word_timestamps.append({
                "word": chunk["text"].strip(),
                "start": float(chunk["timestamp"][0]),
                "end": float(chunk["timestamp"][1])
            })
            
        return {
            "text": result["text"].strip(),
            "wordTimestamps": word_timestamps
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/score")
async def score(audio_file: UploadFile = File(...), _ = Depends(verify_headers)):
    try:
        audio_bytes = await audio_file.read()
        audio, _ = librosa.load(io.BytesIO(audio_bytes), sr=16000)
        
        inference = get_models()["wav2vec2"]
        result = inference(audio)
        
        text = result["text"].replace("<s>", "").replace("</s>", "").replace("<pad>", "").strip()
        
        return {
            "text": text
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
