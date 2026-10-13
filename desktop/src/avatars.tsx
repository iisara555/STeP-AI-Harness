import { AVATAR_IDS, RETIRED_AVATAR_IDS } from './avatar-ids';

// Bundled with the app, so a picture never loads from the network or the employee's disk.
const files = import.meta.glob<string>('./assets/avatars/*.webp', { eager: true, import: 'default' });
export const AVATARS = AVATAR_IDS.map(id => ({ id, src: files[`./assets/avatars/${id}.webp`] })).filter(a => a.src);
const byId = new Map(AVATARS.map(a => [a.id, a.src]));

/** The pictures the picker offers: each drawing once, plus a retired one only while it is the employee's choice. */
export const pickableAvatars = (current?: string) => AVATARS.filter(a => !RETIRED_AVATAR_IDS.includes(a.id) || a.id === current);

/** The employee's chosen picture, or their initial in a circle when none is chosen. */
export function Avatar({ id, fallback, className = '' }: { id?: string; fallback: string; className?: string }) {
  const src = id ? byId.get(id) : undefined;
  return (
    <span className={`avatar-badge ${src ? 'has-picture' : ''} ${className}`} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : fallback}
    </span>
  );
}
