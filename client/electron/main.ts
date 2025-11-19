import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

const IMAGE_FILTERS = [
  {
    name: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'],
  },
]

const getMimeType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    default:
      return 'application/octet-stream'
  }
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

ipcMain.handle('voyis:select-images', async () => {
  if (!win) {
    throw new Error('Main window is not ready')
  }

  const result = await dialog.showOpenDialog(win, {
    title: 'Select images',
    properties: ['openFile', 'multiSelections'],
    filters: IMAGE_FILTERS,
  })

  if (result.canceled || result.filePaths.length === 0) {
    return []
  }

  const files = await Promise.all(
    result.filePaths.map(async (filePath) => {
      const [fileBuffer, stats] = await Promise.all([
        fs.readFile(filePath),
        fs.stat(filePath),
      ])

      return {
        path: filePath,
        name: path.basename(filePath),
        type: getMimeType(filePath),
        size: stats.size,
        lastModified: stats.mtimeMs,
        data: fileBuffer.toString('base64'),
      }
    }),
  )

  return files
})

ipcMain.handle('voyis:select-folder-config', async () => {
  if (!win) {
    throw new Error('Main window is not ready')
  }

  const configDialog = await dialog.showOpenDialog(win, {
    title: 'Select folder config (JSON)',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (configDialog.canceled || configDialog.filePaths.length === 0) {
    return null
  }

  const configPath = configDialog.filePaths[0]
  const raw = await fs.readFile(configPath, 'utf-8')

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`)
  }

  const folders = Array.isArray(parsed)
    ? parsed
    : parsed.folders || parsed.sources || []

  if (!Array.isArray(folders) || folders.length === 0) {
    throw new Error('Config must include a non-empty "folders" array')
  }

  const files: any[] = []

  const readDirectory = async (dirPath: string, extensions?: string[], recursive = false) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (recursive) {
          await readDirectory(fullPath, extensions, recursive)
        }
        continue
      }

      const ext = path.extname(entry.name).replace('.', '').toLowerCase()
      if (extensions && extensions.length > 0 && !extensions.includes(ext)) {
        continue
      }

      const [buffer, stats] = await Promise.all([
        fs.readFile(fullPath),
        fs.stat(fullPath),
      ])

      files.push({
        path: fullPath,
        name: entry.name,
        type: getMimeType(fullPath),
        size: stats.size,
        lastModified: stats.mtimeMs,
        data: buffer.toString('base64'),
      })
    }
  }

  for (const folder of folders) {
    if (!folder?.path) continue
    const allowedExtensions = Array.isArray(folder.types)
      ? folder.types.map((t: string) => t.toLowerCase())
      : undefined
    await readDirectory(folder.path, allowedExtensions, Boolean(folder.recursive))
  }

  return { files, configPath }
})

// Quit when all windows are closed, except on macOS. There, it's common
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
