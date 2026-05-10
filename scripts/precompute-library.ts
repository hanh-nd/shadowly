import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../apps/frontend/public/audio-library');
const GATEWAY_URL = process.env.VITE_GATEWAY_URL;

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface LibraryItem {
  id: string;
  name: string;
  url: string;
  tags: string[];
  duration: string;
  text?: string;
  wordTimestamps?: WordTimestamp[];
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function transcribeFile(filePath: string): Promise<{ text: string, wordTimestamps: WordTimestamp[] } | null> {
  console.log(`Transcribing ${filePath}...`);
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'audio/mpeg' });
  formData.append('audio_file', blob, path.basename(filePath));

  try {
    const res = await fetch(`${GATEWAY_URL}/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gateway error: ${err}`);
    }

    return await res.json() as any;
  } catch (e) {
    console.error(`Failed to transcribe ${filePath}:`, e);
    return null;
  }
}

async function processDirectory(dir: string, base: string = '', cache: Map<string, LibraryItem> = new Map()): Promise<LibraryItem[]> {
  const items = fs.readdirSync(dir);
  let result: LibraryItem[] = [];

  for (const item of items) {
    if (item === 'manifest.json' || item.startsWith('.')) continue;

    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    const relativeUrl = path.join(base, item);
    const itemUrl = `/audio-library/${relativeUrl}`;

    if (stats.isDirectory()) {
      const subItems = await processDirectory(fullPath, relativeUrl, cache);
      result = result.concat(subItems);
    } else if (item.endsWith('.mp3')) {
      const id = relativeUrl.replace(/\//g, '-').replace('.mp3', '');
      const name = item.replace('.mp3', '');
      const tags = base.split('/').filter(Boolean);
      
      const jsonPath = fullPath.replace('.mp3', '.json');
      let transcription: { text: string, wordTimestamps: WordTimestamp[] } | null = null;

      if (fs.existsSync(jsonPath)) {
        try {
            transcription = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch (e) {
            console.warn(`Malformed JSON at ${jsonPath}, re-transcribing...`);
        }
      }

      if (!transcription) {
        transcription = await transcribeFile(fullPath);
        if (transcription) {
          fs.writeFileSync(jsonPath, JSON.stringify(transcription, null, 2));
          console.log(`Saved transcription to ${jsonPath}`);
        }
      }

      let duration = '00:00';
      if (transcription?.wordTimestamps && transcription.wordTimestamps.length > 0) {
        const lastWord = transcription.wordTimestamps[transcription.wordTimestamps.length - 1];
        duration = formatDuration(lastWord.end);
      }

      result.push({
        id,
        name,
        url: itemUrl,
        tags,
        duration,
      });
    }
  }

  return result;
}

async function run() {
  console.log('Starting precomputation...');
  const manifestPath = path.join(ROOT, 'manifest.json');
  let cache = new Map<string, LibraryItem>();
  
  if (fs.existsSync(manifestPath)) {
    try {
      const existing: LibraryItem[] = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      cache = new Map(existing.map(item => [item.url, item]));
      console.log(`Loaded cache with ${cache.size} items from existing manifest.`);
    } catch (e) {
      console.warn('Failed to load existing manifest for caching.');
    }
  }

  const structure = await processDirectory(ROOT, '', cache);
  fs.writeFileSync(manifestPath, JSON.stringify(structure, null, 2));
  console.log(`Manifest updated with ${structure.length} items.`);
}

run().catch(console.error);
