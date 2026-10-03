// The profile pictures an employee can choose (src/assets/avatars/avatar-01.webp … avatar-36.webp): hand-drawn
// illustrations, not photos of real people. Shared by the main process, which only stores an id from this list.
export const AVATAR_COUNT = 36;
export const AVATAR_IDS = Array.from({ length: AVATAR_COUNT }, (_, i) => `avatar-${String(i + 1).padStart(2, '0')}`);
export const isAvatarId = (value: unknown): value is string => typeof value === 'string' && AVATAR_IDS.includes(value);
