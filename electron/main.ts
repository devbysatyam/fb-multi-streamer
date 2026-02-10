import { app, BrowserWindow, protocol, net } from 'electron'
import { pathToFileURL } from 'node:url'
// import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { logger } from './utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

global.__filename = __filename
global.__dirname = __dirname

// registerHandlers();

// Register privileged schemes
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true
    }
  }
])

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

async function createWindow() {
  logger.info('Creating main window...');
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC || '', 'app-logo.png'),
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#09090b',
    show: false, // Prevents white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.once('ready-to-show', () => {
    win?.show();
  });

  win.setMenuBarVisibility(false)

  // Also remove it globally
  const { Menu } = await import('electron')
  Menu.setApplicationMenu(null)

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    logger.info('Main window did-finish-load');
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  logger.info('App is ready, initializing components...');
  // Register media protocol handler
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      let fullPath = '';

      // Handle Windows drive letters correctly. Electron's URL parser often 
      // treats "C:" in media://C:/path as the host "c" (dropping the colon).
      if (process.platform === 'win32' && url.host.length === 1 && /^[a-zA-Z]$/.test(url.host)) {
        fullPath = url.host + ':' + decodeURIComponent(url.pathname);
      } else {
        // For other cases (media:///C:/... where host is empty), use host + pathname
        fullPath = decodeURIComponent(url.host + url.pathname);
      }

      // Ensure we don't have a leading slash before the drive letter e.g. /C:/ -> C:/
      if (process.platform === 'win32' && fullPath.startsWith('/') && fullPath.match(/^\/[a-zA-Z]:/)) {
        fullPath = fullPath.slice(1);
      }

      const normalized = path.normalize(fullPath);
      if (!fs.existsSync(normalized)) {
        return new Response('File not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(normalized).toString());
    } catch (e) {
      console.error('Media protocol error:', e);
      return new Response('Invalid media path', { status: 400 });
    }
  });

  try {
    logger.info('Registering IPC handlers...');
    const { registerHandlers } = await import('./ipc/handlers');
    registerHandlers();
    logger.info('IPC Handlers successfully registered.');

    // Initialize stream orchestrator
    logger.info('Initializing Stream Orchestrator...');
    await import('./streaming/orchestrator');
    logger.info('Stream Orchestrator initialized.');
  } catch (e: any) {
    logger.error('CRITICAL: Failed to initialize handlers or orchestrator:', e);
  }
  createWindow();
})
