/** The Kaana wordmark: a bowl with steam, and the name in the display face. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-display text-2xl font-bold tracking-tight text-navy ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7">
        <path d="M4 16h24a12 12 0 0 1-24 0Z" fill="#F2C14E" />
        <path d="M11 11c0-2 2-2 2-4M16 11c0-2 2-2 2-4M21 11c0-2 2-2 2-4" fill="none" stroke="#0B1F44" strokeWidth="2" strokeLinecap="round" />
        <rect x="2" y="15" width="28" height="2.5" rx="1.25" fill="#0B1F44" />
      </svg>
      kaana
    </span>
  );
}
