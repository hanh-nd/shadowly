// Fixes Vite/Webpack bundling errors for vad-web and onnxruntime-web
if (
  typeof (self as unknown as Record<string, unknown>).exports === 'undefined'
) {
  (self as unknown as Record<string, unknown>).exports = {};
}
if (
  typeof (self as unknown as Record<string, unknown>).require === 'undefined'
) {
  (self as unknown as Record<string, unknown>).require = function () {
    return {};
  } as unknown as NodeJS.Require;
}

if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function (
    search: string | RegExp,
    replacement: ((substring: string, ...args: unknown[]) => string) | string,
  ) {
    if (typeof replacement === 'string') {
      if (search instanceof RegExp) return this.replace(search, replacement);
      return this.replace(
        new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
    } else {
      if (search instanceof RegExp) return this.replace(search, replacement);
      return this.replace(
        new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
    }
  };
}
