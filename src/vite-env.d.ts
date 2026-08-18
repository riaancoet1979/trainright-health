/// <reference types="vite/client" />

/**
 * Build stamp injected by `define` in vite.config.ts — "MM-DD HH:mm · <sha>".
 * Rendered in the app header so it is obvious at a glance which build a device
 * is actually running, which matters because the iOS home-screen PWA caches
 * hard enough to keep serving an old bundle across restarts.
 */
declare const __BUILD_STAMP__: string;
