import { useEffect, useState } from 'react';
import { initialsOf } from '../images/catalog';

/** A photo, or a branded tile with initials when there is none or it fails to load. Size it with `className`. */
export function DishImage({ src, name, className = '' }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) {
    return (
      <div role="img" aria-label={name} data-testid="image-tile"
        className={`flex items-center justify-center bg-sand font-display text-lg font-bold text-navy/60 ${className}`}>
        {initialsOf(name)}
      </div>
    );
  }
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}
