import { contextBridge, ipcRenderer } from 'electron';
const allowed = new Set([
  'snapshot',
  'settings',
  'workspace',
  'connection',
  'runtime',
  'connect',
  'disconnect',
  'create',
  'models',
  'model',
  'authCode',
  'skills',
  'ocrInstall',
  'cancelConnect',
  'claudeCode',
  'handoff',
  'removeConnection',
  'sessionConnection',
  'openHelp',
  'tour',
  'ocrStatus',
  'ocrFolder',
  'ocrStart',
  'ocrRead',
  'ocrResolve',
  'ocrSave',
  'send',
  'cancel',
  'pin',
  'rename',
  'remove',
  'edit',
  'accept',
  'reject',
  'restore',
  'attach',
  'export',
  'reveal',
]);
contextBridge.exposeInMainWorld('step', {
  call: (method: string, input: unknown) => {
    if (!allowed.has(method)) throw new Error('UNKNOWN_OPERATION');
    return ipcRenderer.invoke('step:call', method, input);
  },
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on('step:event', handler);
    return () => ipcRenderer.removeListener('step:event', handler);
  },
});
