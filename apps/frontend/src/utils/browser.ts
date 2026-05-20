export function isWebGPUAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    navigator.gpu != null
  );
}

export function isSafariBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome/i.test(ua) && !/Chromium/i.test(ua);
}

export function isMobileDevice(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
