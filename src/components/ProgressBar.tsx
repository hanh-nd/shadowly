interface Props {
  activeIndex: number;
  total: number;
}

export function ProgressBar({ activeIndex, total }: Props) {
  const pct = total > 0 ? ((activeIndex + 1) / total) * 100 : 0;
  return (
    <div className="fixed top-16 left-0 lg:left-64 right-0 h-1 bg-surface-container-high z-30">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
