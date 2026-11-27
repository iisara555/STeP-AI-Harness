import type { ReactNode } from 'react';
import { AVATAR_IDS, RETIRED_AVATAR_IDS, isCustomAvatar } from './avatar-ids';

// Illustrations are bundled. Personal photos use a local thumbnail from Settings.
const files = import.meta.glob<string>('./assets/avatars/*.webp', { eager: true, import: 'default' });
export const AVATARS = AVATAR_IDS.map(id => ({ id, src: files[`./assets/avatars/${id}.webp`] })).filter(a => a.src);
const byId = new Map(AVATARS.map(a => [a.id, a.src]));

/** The pictures the picker offers: each drawing once, plus a retired one only while it is the employee's choice. */
export const pickableAvatars = (current?: string) => AVATARS.filter(a => !RETIRED_AVATAR_IDS.includes(a.id) || a.id === current);

/** The employee's chosen picture, or their initial in a circle when none is chosen. */
export function Avatar({ id, fallback, className = '' }: { id?: string; fallback: ReactNode; className?: string }) {
  const custom = isCustomAvatar(id);
  const src = custom ? id : id ? byId.get(id) : undefined;
  return (
    <span className={`avatar-badge ${src ? 'has-picture' : ''} ${custom ? 'custom-avatar' : ''} ${className}`} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : fallback}
    </span>
  );
}
