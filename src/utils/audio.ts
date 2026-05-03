export async function decodeAndResampleTo16kHz(
  data: ArrayBuffer | Blob
): Promise<Float32Array> {
  const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data;

  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  audioCtx.close();

  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0).slice(0); // clone for safety
  }

  const targetLength = Math.round(decoded.duration * 16000);
  const offlineCtx = new OfflineAudioContext(1, targetLength, 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

export async function resampleFloat32ArrayTo16kHz(
  audioData: Float32Array,
  fromRate: number,
): Promise<Float32Array> {
  if (fromRate === 16000) return audioData.slice(0); // Clone for safe transfer

  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(audioData.length * (16000 / fromRate)),
    16000,
  );
  const buffer = offlineCtx.createBuffer(1, audioData.length, fromRate);
  buffer.copyToChannel(audioData as Float32Array<ArrayBuffer>, 0);

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer.getChannelData(0);
}
