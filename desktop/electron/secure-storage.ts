type KeyStorage = { isEncryptionAvailable: () => boolean; getSelectedStorageBackend?: () => string | undefined };
/** Electron's basic_text fallback uses a fixed password, so availability alone is not a secure key-store check. */
export function requireSecureStorage(storage: KeyStorage, platform: NodeJS.Platform = process.platform) {
  if (
    !storage.isEncryptionAvailable() ||
    (platform === 'linux' && !['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(storage.getSelectedStorageBackend?.() || ''))
  )
    throw new Error('SECURE_STORAGE_UNAVAILABLE');
}
