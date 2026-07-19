import type { LightSearchApi } from '../../shared/api';

declare global {
  interface Window {
    lightsearch: LightSearchApi;
  }
}

export {};
