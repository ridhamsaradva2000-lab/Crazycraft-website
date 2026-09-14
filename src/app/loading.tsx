export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-paper">
      <div className="text-center">
        <p className="font-display text-xl text-brand-900">CrazyCraft</p>
        <p className="mt-2 animate-pulse font-body text-sm text-ink-muted">Loading…</p>
      </div>
    </div>
  );
}