/**
 * The bundled photos that exist under `public/images`, as site-absolute paths.
 * `scripts/generate-images.py` rewrites this file after it generates photos.
 * Empty means every picture renders as a branded tile and nothing is requested.
 */
export const AVAILABLE_IMAGES: ReadonlySet<string> = new Set<string>([]);
