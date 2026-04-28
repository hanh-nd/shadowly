export function TopBar() {
  return (
    <nav className="fixed top-0 left-0 w-full z-50 flex h-16 px-6 items-center lg:left-64 lg:w-[calc(100%-16rem)] bg-white/80 backdrop-blur-md border-b border-slate-200">
      <span className="text-lg font-bold tracking-tighter text-blue-600">
        ShadowFlow
      </span>
    </nav>
  );
}
