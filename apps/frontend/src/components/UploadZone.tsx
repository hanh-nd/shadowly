import { useRef } from 'react';

interface Props {
  onFileSelect: (file: File) => void;
  className?: string;
}

export function UploadZone({ onFileSelect, className = '' }: Props) {
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
    <div className={className}>
      <div
        className="border border-dashed border-outline-variant rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-surface-container-low transition-colors cursor-pointer group"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors mb-2">
          cloud_upload
        </span>
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          Drag audio here
        </span>
        <span className="text-[10px] text-outline mt-1">
          or click to browse
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,audio/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
