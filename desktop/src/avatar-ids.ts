// The profile pictures an employee can choose (src/assets/avatars/avatar-01.webp … avatar-36.webp): hand-drawn
// illustrations, not photos of real people. Shared by the main process, which only stores an id from this list.
export const AVATAR_COUNT = 36;
export const AVATAR_IDS = Array.from({ length: AVATAR_COUNT }, (_, i) => `avatar-${String(i + 1).padStart(2, '0')}`);
export const isAvatarId = (value: unknown): value is string => typeof value === 'string' && AVATAR_IDS.includes(value);
// Drawings that turned out to be near-copies of another one (30 of 12, 34 of 04, 35 of 08). The picker no longer
// offers them, but an employee who already chose one keeps it, so the ids and files stay valid.
export const RETIRED_AVATAR_IDS = ['avatar-30', 'avatar-34', 'avatar-35'];
