# Shadowly

**Shadowly** is a web-based application designed for language learning through "shadowing" (repeating after native audio). It leverages an AI-powered inference API to provide fast, mobile-friendly transcription and pronunciation scoring.

## Features

- **Audio Shadowing**: Practice pronunciation by repeating after native speaker audio segments.
- **Hybrid Cloud/Local ML**: 
  - **Cloud**: High-performance Whisper and Wav2Vec2 models run on an inference server (FastAPI) for high accuracy and mobile support.
  - **Local**: Voice Activity Detection (VAD) and G2P run in the browser for low-latency feedback.
- **Real-time Transcription**: Transcribes native segments with word-level timestamps.
- **Pronunciation Scoring**: Evaluates your pronunciation on a word-by-word basis using phonetic alignment.
- **Auto-Cruise**: Hands-free practice loop that automatically advances through segments as you speak.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Vanilla CSS
- **Backend (Inference API)**: Python, FastAPI, Whisper-v3-turbo, Wav2Vec2 (Phonetic)
- **G2P**: `espeak-ng` compiled to WebAssembly (Local)
- **VAD**: `@ricky0123/vad-web` (Local)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Python 3.10+ (for backend)

### Installation

1. **Clone and Install Frontend**:
   ```bash
   git clone <repository-url>
   cd shadowly
   npm install
   ```

2. **Setup Backend**:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r backend/requirements.txt # Create this file or install manually: fastapi, uvicorn, torch, transformers, librosa, soundfile, accelerate, python-dotenv
   ```

3. **Environment Variables**:
   Create a `.env.local` file in the root:
   ```env
   VITE_INFERENCE_BASE_URL=http://localhost:8000
   VITE_INFERENCE_KEY=your_secure_key
   VITE_INFERENCE_SECRET=your_secure_secret
   ```

### Development

1. **Start Backend**:
   ```bash
   source venv/bin/activate
   python backend/main.py
   ```

2. **Start Frontend**:
   ```bash
   npm run dev
   ```

## Deployment

### Backend (Standard Container)
The backend is a standard FastAPI app. You can containerize it and deploy it to any provider (AWS SageMaker, Lambda, GCP Cloud Run, or specialized GPU hosts).

### Optional: Deploy to Modal.com
If you prefer using Modal, a wrapper is provided. 

1. **Setup Production Secrets**:
   Go to the [Modal Secrets Dashboard](https://modal.com/secrets) and create a secret named `shadowly-secrets` with:
   - `INFERENCE_KEY`: your_secure_key
   - `INFERENCE_SECRET`: your_secure_secret

2. **Deploy**:
   ```bash
   modal deploy backend/modal_app.py
   ```
   This will use your named secrets and enable GPU memory snapshots for sub-second cold starts.

### Frontend
Build the static site:
```bash
npm run build
```
Deploy the `dist` folder to any static hosting provider.

## How it Works

1. **Audio Input**: Captured locally via microphone.
2. **VAD (Local)**: Detects speech boundaries in the browser.
3. **Transcription (Cloud)**: Native segments are sent to the inference API for high-accuracy word timestamps.
4. **Scoring (Hybrid)**:
   - **G2P (Local)**: Converts text to expected IPA.
   - **CTC (Cloud)**: Extracts spoken IPA from user audio via the inference API.
   - **Alignment (Local)**: Aligns sequences to produce word-level scores.

## License

This project is licensed under the MIT License.
