import { useRef } from 'react';

interface Props {
  onFileSelect: (file: File) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  autoStopEnabled: boolean;
  autoCruiseEnabled: boolean;
  onToggleAutoStop: () => void;
  onToggleAutoCruise: () => void;
}

export function Sidebar({
  onFileSelect,
  speed,
  onSpeedChange,
  autoStopEnabled,
  autoCruiseEnabled,
  onToggleAutoStop,
  onToggleAutoCruise,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = '';
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 fixed left-0 top-0 h-full py-8 px-4 bg-slate-50 border-r border-slate-200 z-40">
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
          <span className="material-symbols-outlined text-on-primary-container">graphic_eq</span>
        </div>
        <div>
          <h2 className="font-label-sm text-label-sm text-on-surface">Session Control</h2>
          <p className="text-[11px] text-on-surface-variant font-medium">Minimalist Tutor Mode</p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-stack-lg">
        {/* Auto-Settings Toggles */}
        <div className="px-2 mb-stack-lg flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Auto-Stop</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoStopEnabled}
                onChange={onToggleAutoStop}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Auto-Cruise</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoCruiseEnabled}
                onChange={onToggleAutoCruise}
                disabled={!autoStopEnabled}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>

        {/* Speed slider */}
        <div className="px-2">
          <label className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mb-2">
            <span>Speed</span>
            <span className="text-primary font-bold">{speed.toFixed(1)}x</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="w-full h-1 bg-surface-variant rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-[10px] text-outline mt-1 font-medium">
            <span>0.5x</span>
            <span>1.5x</span>
          </div>
        </div>

        {/* Upload zone */}
        <div
          className="border border-dashed border-outline-variant rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-surface-container-low transition-colors cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors mb-2">cloud_upload</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Drag audio here</span>
          <span className="text-[10px] text-outline mt-1">or click to browse</span>
        </div>

        <button
          className="w-full py-3 px-4 bg-primary text-on-primary rounded-DEFAULT font-label-sm text-label-sm hover:opacity-90 transition-opacity flex justify-center items-center gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="material-symbols-outlined text-[18px]">upload</span>
          Upload New Audio
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </aside>
  );
}
