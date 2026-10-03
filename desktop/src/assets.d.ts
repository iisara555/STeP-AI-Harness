declare module '*.svg' {
  const url: string;
  export default url;
}
declare module '*.png' {
  const url: string;
  export default url;
}
declare module '*.webp' {
  const url: string;
  export default url;
}
// Vite's eager glob import (src/avatars.tsx); the project does not load vite/client types.
interface ImportMeta {
  glob<T = unknown>(pattern: string, options: { eager: true; import: 'default' }): Record<string, T>;
}
