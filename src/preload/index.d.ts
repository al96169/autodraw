import type { AutodrawApi } from './index'

declare global {
  interface Window {
    api: AutodrawApi
  }
}

export {}
