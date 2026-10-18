"use client";

export function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/60">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      <p className="text-sm font-medium text-white">{message}</p>
    </div>
  );
}
