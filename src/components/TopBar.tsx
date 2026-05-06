interface Props {
  filename?: string | null;
  activeIndex: number;
  total: number;
  onMenuClick: () => void;
}

export function TopBar({ filename, activeIndex, total, onMenuClick }: Props) {
  const pct = total > 0 ? ((activeIndex + 1) / total) * 100 : 0;

  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex h-16 px-4 md:px-6 items-center lg:left-64 lg:w-[calc(100%-16rem)] bg-white/80 backdrop-blur-md border-b border-slate-200 gap-3">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
      >
        <span className="material-symbols-outlined">menu</span>
      </button>

      <span className="text-lg font-bold tracking-tighter text-blue-600 truncate flex-1">
        {filename || 'Shadowly'}
      </span>

      {/* Progress Bar at the bottom of TopBar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container-high overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </nav>
  );
}
