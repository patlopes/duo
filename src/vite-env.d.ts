/// <reference types="vite/client" />

declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;

interface Navigator {
  /** Safari only: true when running from the Home Screen. */
  readonly standalone?: boolean;
}
