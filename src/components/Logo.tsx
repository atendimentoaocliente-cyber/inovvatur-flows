export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1">
      <svg viewBox="0 0 48 48" className="h-[26px] w-[26px]" aria-hidden="true">
        <path d="M24 3 L40 45 L24 34 L8 45 Z" fill="#2E6BFF" />
        <path d="M24 3 L24 34 L8 45 Z" fill="#0147FF" />
      </svg>
      <b className="font-display text-[18px] font-bold tracking-[0.14em]">INVT</b>
    </div>
  );
}
