/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface VoyisSelectedFile {
  path: string
  name: string
  type: string
  size: number
  lastModified: number
  data: string
}

interface FolderConfigResult {
  files: VoyisSelectedFile[]
  configPath: string
}

interface Window {
  ipcRenderer: import('electron').IpcRenderer
  voyisAPI?: {
    selectImages: () => Promise<VoyisSelectedFile[]>
    selectFolderConfig: () => Promise<FolderConfigResult | null>
  }
}
