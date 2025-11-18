/// <reference types="vite/client" />

interface VoyisSelectedFile {
  path: string
  name: string
  type: string
  size: number
  lastModified: number
  data: string
}

declare interface Window {
  voyisAPI?: {
    selectImages: () => Promise<VoyisSelectedFile[]>
  }
}