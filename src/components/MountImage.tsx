import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useObjectUrl } from '../hooks';
import type { SandboxMount } from '../mounts';

/** Props for {@link MountImage}. Extends the native `<img>` attributes (minus `src`,
 *  which the component derives from the mounted file). */
export interface MountImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** The mount whose file to display (`null`/`undefined` renders `loading`). */
  mount: SandboxMount | null | undefined;
  /** Mount-relative path to the image file (`null`/`undefined` renders `loading`). */
  relPath: string | null | undefined;
  /** Override the MIME type inferred from the extension (rarely needed). */
  type?: string;
  /** Rendered while the bytes load. Defaults to nothing. (Named `placeholder`, not
   *  `loading`, so the native `<img loading="lazy">` attribute still passes through.) */
  placeholder?: ReactNode;
  /** Rendered when the read fails or the file is missing. Defaults to nothing. */
  fallback?: ReactNode;
}

/**
 * Display an image file from a mount. Reads the bytes off the sandbox ZenFS, turns
 * them into an object URL, and renders an `<img>` — revoking the URL for you on
 * unmount / prop change (via {@link useObjectUrl}). This is the drop-in for the
 * pattern apps used to hand-roll: read bytes → `Blob` → `createObjectURL` → revoke.
 *
 * Any extra `<img>` attribute (`className`, `style`, `onClick`, `width`, …) passes
 * straight through. Provide `loading` / `fallback` for the pending and error states.
 *
 * ```tsx
 * <MountImage
 *   mount={mount}
 *   relPath="photos/cat.png"
 *   alt="cat"
 *   placeholder={<Spinner />}
 *   fallback={<span>missing</span>}
 * />
 * ```
 */
export function MountImage({ mount, relPath, type, placeholder, fallback, alt = '', ...imgProps }: MountImageProps) {
  const { url, loading, error } = useObjectUrl(mount, relPath, type ? { type } : undefined);
  if (loading) return <>{placeholder ?? null}</>;
  if (error || !url) return <>{fallback ?? null}</>;
  return <img src={url} alt={alt} {...imgProps} />;
}
