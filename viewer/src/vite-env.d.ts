/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** wss:// address of a separately hosted multiplayer relay; empty means the page's own server. */
  readonly VITE_RELAY_URL?: string;
}
