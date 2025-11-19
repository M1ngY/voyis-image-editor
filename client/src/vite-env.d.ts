/// <reference types="vite/client" />

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

declare interface Window {
  voyisAPI?: {
    selectImages: () => Promise<VoyisSelectedFile[]>
    selectFolderConfig: () => Promise<FolderConfigResult | null>
  }
}