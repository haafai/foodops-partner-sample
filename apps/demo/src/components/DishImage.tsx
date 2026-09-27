import { useEffect, useState } from 'react';
import { initialsOf } from '../images/catalog';

/**
 * A photo, or a branded tile (the bowl and the initials) when there is none or it fails to load.
 * Size it with `className`; the tile's glyph and initials follow the font size given there.
 */
export function DishImage({ src, name, className = '' }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) {
    return (
      <div role="img" aria-label={name} data-testid="image-tile"
        className={`flex flex-col items-center justify-center gap-[0.2em] bg-gradient-to-br from-sand to-mustard/40 font-display font-bold text-navy/70 ${className}`}>
        <svg aria-hidden="true" viewBox="0 0 32 32" className="h-[1.4em] w-[1.4em]">
          <path d="M4 16h24a12 12 0 0 1-24 0Z" fill="#F2C14E" />
          <path d="M11 11c0-2 2-2 2-4M16 11c0-2 2-2 2-4M21 11c0-2 2-2 2-4" fill="none" stroke="#0B1F44" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
          <rect x="2" y="15" width="28" height="2.5" rx="1.25" fill="#0B1F44" fillOpacity="0.7" />
        </svg>
        <span className="leading-none">{initialsOf(name)}</span>
      </div>
    );
  }
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}
