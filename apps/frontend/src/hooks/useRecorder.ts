import { useEffect, useRef, useState } from 'react';

import { MediaRecorderState } from '../types';

const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav',
];

// Get the best supported MIME type for the current browser
const getSupportedMimeType = () => {
  return (
    SUPPORTED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ||
    ''
  );
};

export function useRecorder() {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const cleanup = () => {
    if (
      recorderRef.current &&
      recorderRef.current.state !== MediaRecorderState.Inactive
    ) {
      recorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  async function startRecording() {
    setMicError(null);
    try {
      // Always get a fresh stream to ensure mic indicator turns off when stopped
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const options = { mimeType: getSupportedMimeType() };
      const recorder = new MediaRecorder(stream, options);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Mic blocked — check browser permissions'
          : 'Could not access microphone. Please ensure it is connected.';
      setMicError(message);
    }
  }

  function stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === MediaRecorderState.Inactive) {
        cleanup();
        setIsRecording(false);
        resolve(new Blob());
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || getSupportedMimeType();
        const blob = new Blob(chunksRef.current, { type: mimeType });

        cleanup();
        setIsRecording(false);
        resolve(blob);
      };

      recorder.stop();
    });
  }

  return { startRecording, stopRecording, isRecording, micError };
}
