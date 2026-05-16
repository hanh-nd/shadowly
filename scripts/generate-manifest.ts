import fs from 'fs';
import path from 'path';

const ROOT = 'apps/frontend/public/audio-library';

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface LibraryItem {
  id: string;
  name: string;
  fileUrl: string;
  manifestUrl: string;
  tags: string[];
  duration: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function sanitizeTimestamps(words: WordTimestamp[]): WordTimestamp[] {
  return words.map((w, i, arr) => {
    if (i === 0 || w.start >= arr[i - 1].end) return w;
    return { ...w, start: arr[i - 1].end };
  });
}

function getLibraryItems(dir: string, base: string = ''): LibraryItem[] {
  const items = fs.readdirSync(dir);
  let result: LibraryItem[] = [];

  for (const item of items) {
    if (item === 'manifest.json' || item.startsWith('.')) continue;

    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    const relativeUrl = path.join(base, item);

    if (stats.isDirectory()) {
      result = result.concat(getLibraryItems(fullPath, relativeUrl));
    } else if (item.endsWith('.mp3')) {
      const id = relativeUrl.replace(/\//g, '-').replace('.mp3', '');
      const name = item.replace('.mp3', '');
      const tags = base.split('/').filter(Boolean);
      
      let duration = '00:00';

      const jsonPath = fullPath.replace('.mp3', '.json');
      if (fs.existsSync(jsonPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          const wordTimestamps: WordTimestamp[] | undefined = data.wordTimestamps
            ? sanitizeTimestamps(data.wordTimestamps)
            : undefined;

          if (wordTimestamps && wordTimestamps.length > 0) {
            duration = formatDuration(wordTimestamps[wordTimestamps.length - 1].end);
          }
        } catch (e) {
          console.warn(`Failed to read transcription for ${item}`, e);
        }
      }

      result.push({
        id,
        name,
        fileUrl: `/audio-library/${relativeUrl}`,
        manifestUrl: `/audio-library/${relativeUrl.replace(/\.mp3$/, '.json')}`,
        tags,
        duration,
      });
    }
  }

  return result;
}

const structure = getLibraryItems(ROOT);
fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(structure, null, 2));
console.log(`Manifest generated with ${structure.length} items at apps/frontend/public/audio-library/manifest.json`);
