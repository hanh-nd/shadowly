# Shadowly

**Shadowly** is a web-based application designed for language learning through "shadowing" (repeating after native audio). It leverages local machine learning models running entirely within your browser to transcribe audio and provide real-time pronunciation scoring, ensuring maximum privacy and low latency.

Check out [Live Demo](https://shadowly.netlify.app).

## Features

- **Audio Shadowing**: Practice pronunciation by repeating after native speaker audio segments.
- **In-Browser ML**: All machine learning models run locally in your browser using WebAssembly. No audio is ever sent to a remote server.
- **Real-time Transcription**: Transcribes spoken audio on the fly.
- **Pronunciation Scoring**: Evaluates your pronunciation on a word-by-word basis using Dynamic Time Warping (DTW) and deep learning audio embeddings (`Xenova/hubert-base-ls960`).
- **Voice Activity Detection (VAD)**: Smartly detects when you start and stop speaking.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Machine Learning**: `@huggingface/transformers` (Transformers.js)
- **Audio Processing**: `@ricky0123/vad-web` for Voice Activity Detection, `essentia.js` for audio analysis

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- `npm` or `yarn`

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd shadowly
   ```

2. Install dependencies:
   ```bash
   yarn install
   # or npm install
   ```

3. Start the development server:
   ```bash
   yarn dev
   # or npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

### Build for Production

To build the application for production:

```bash
yarn build
# or npm run build
```

This will compile the TypeScript code and bundle the application into the `dist` folder.

## How it Works

1. **Audio Input**: The application captures audio from your microphone using the Web Audio API.
2. **VAD**: Voice Activity Detection monitors the stream to automatically start and stop recording when you speak.
3. **Processing**: The recorded audio is decoded and resampled to 16kHz via Web Workers to prevent blocking the main UI thread.
4. **Scoring**: A `scoring.worker` computes audio embeddings and uses DTW (Dynamic Time Warping) to compare your pronunciation against the reference audio segment.
5. **Feedback**: You receive immediate visual feedback on your pronunciation accuracy for each word.

## License

This project is licensed under the MIT License.
