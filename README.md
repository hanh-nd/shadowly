# Shadowly

**Shadowly** is a web-based application designed for language learning through "shadowing" (repeating after native audio). It leverages an AI-powered inference architecture to provide fast, mobile-friendly transcription and pronunciation scoring.

## Features

- **Audio Shadowing**: Practice pronunciation by repeating after native speaker audio segments.
- **Hybrid Cloud/Local ML**: 
  - **Cloud (Groq)**: Ultra-fast Whisper-v3-turbo via Groq LPU for real-time transcription.
  - **Cloud (Modal)**: High-performance Wav2Vec2 models for pronunciation scoring.
  - **Local**: Voice Activity Detection (VAD) and G2P run in the browser for low-latency feedback.
- **Secure Gateway**: A Cloudflare Worker acts as a secure Backend-for-Frontend (BFF), orchestrating requests to Groq and Modal without exposing keys to the client.
- **Auto-Cruise**: Hands-free practice loop that automatically advances through segments as you speak.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Vanilla CSS
- **Gateway**: Cloudflare Workers (Hono)
- **Backend (Inference API)**: Python, FastAPI, Wav2Vec2 (Phonetic)
- **G2P**: `espeak-ng` compiled to WebAssembly (Local)
- **VAD**: `@ricky0123/vad-web` (Local)

## Project Structure

This project is organized as a monorepo:
- `apps/frontend`: React client application.
- `apps/gateway`: Cloudflare Worker API gateway.
- `apps/backend`: Python/FastAPI scoring engine (Modal.com).

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Python 3.10+ (for backend)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (for gateway)

### Installation

1. **Clone and Install Dependencies**:
   ```bash
   git clone <repository-url>
   cd shadowly
   npm install
   ```

2. **Setup Backend (Scoring Engine)**:
   ```bash
   cd apps/backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

### Environment Variables

1. **Frontend (`apps/frontend/.env.local`)**:
   ```env
   VITE_GATEWAY_URL=http://localhost:8787
   ```

2. **Gateway (`apps/gateway/.dev.vars`)**:
   ```env
   GROQ_API_KEY=your_groq_api_key
   INFERENCE_KEY=your_modal_key
   INFERENCE_SECRET=your_modal_secret
   MODAL_URL=https://your-modal-app-url.modal.run
   ```

### Development (Running Locally)

You need to run all three services for the full experience:

1. **Start Backend (Scoring)**:
   ```bash
   cd apps/backend
   source venv/bin/activate
   python main.py
   ```

2. **Start Gateway (Proxy)**:
   ```bash
   npm run dev:gateway
   ```

3. **Start Frontend (UI)**:
   ```bash
   npm run dev:frontend
   ```

## Deployment

### Gateway (Cloudflare Workers)
```bash
npm run build:gateway
```

### Backend (Modal.com)
```bash
cd apps/backend
modal deploy modal_app.py
```

### Frontend
```bash
npm run build:frontend
```
Deploy the `apps/frontend/dist` folder to any static hosting provider.

## License

This project is licensed under the MIT License.
