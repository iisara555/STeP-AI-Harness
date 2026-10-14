import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron';
import { join } from 'node:path';
import type { EmployeeLogin } from './employee-login';

/** Before identity is verified, no workspace store, providers, timers or tools are initialized. */
export async function openEmployeeLogin(
  login: EmployeeLogin,
  confirmClose?: (window: BrowserWindow) => Promise<boolean>,
): Promise<BrowserWindow | undefined> {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    title: 'STeP Desktop',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1819' : '#fafaf8',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: '#fafaf8', symbolColor: '#231f20', height: 40 } }),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_c, _p, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => window.show());
  const focus = () => {
    window.show();
    window.focus();
  };
  app.on('second-instance', focus);
  let ready: (value: BrowserWindow | undefined) => void = () => {};
  const authenticated = new Promise<BrowserWindow | undefined>(resolve => {
    ready = resolve;
  });
  let confirmingClose = false;
  window.on('close', event => {
    if (!confirmClose || login.state().phase === 'authenticated') return;
    event.preventDefault();
    if (confirmingClose) return;
    confirmingClose = true;
    void confirmClose(window)
      .then(accepted => {
        if (accepted && !window.isDestroyed()) window.destroy();
      })
      .catch(() => {})
      .finally(() => {
        confirmingClose = false;
      });
  });
  window.once('closed', () => {
    login.cancel();
    ready(undefined);
  });
  ipcMain.handle('step:call', async (event, method: string, input: any = {}) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('UNTRUSTED_SENDER');
    if (method === 'windowControl') {
      if (input.action === 'quit') window.close();
      else if (
        input.action === 'titleBar' &&
        process.platform !== 'darwin' &&
        /^#[0-9a-f]{6}$/i.test(input.color) &&
        /^#[0-9a-f]{6}$/i.test(input.symbolColor)
      )
        window.setTitleBarOverlay({ color: input.color, symbolColor: input.symbolColor, height: 40 });
      else throw new Error('INVALID_INPUT');
      return { platform: process.platform };
    }
    if (!['employeeLoginState', 'employeeLoginStart', 'employeeLoginCancel', 'employeeLoginAdopt'].includes(method))
      throw new Error('AUTH_REQUIRED');
    const state =
      method === 'employeeLoginStart'
        ? await login.login()
        : method === 'employeeLoginCancel'
          ? login.cancel()
          : method === 'employeeLoginAdopt'
            ? login.adopt()
            : login.state();
    if (state.phase === 'authenticated') setTimeout(() => ready(window), 0);
    return { ...state, dark: nativeTheme.shouldUseDarkColors };
  });
  try {
    await window.loadFile(join(__dirname, 'renderer/index.html'), { hash: 'employee-login' });
    return await authenticated;
  } finally {
    ipcMain.removeHandler('step:call');
    app.removeListener('second-instance', focus);
  }
}
