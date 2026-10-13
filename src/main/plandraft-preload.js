'use strict';
// 📓 攤開的筆記本（plandraft.html）用：只開放草稿的讀寫、AI 修改、寫入、回去繼續講
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pd', {
  get: () => ipcRenderer.invoke('pd:get'),
  edit: (id, f) => ipcRenderer.invoke('pd:edit', id, f),
  remove: (id) => ipcRenderer.invoke('pd:remove', id),
  add: (kind, f) => ipcRenderer.invoke('pd:add', kind, f),
  resolve: (id, as, f) => ipcRenderer.invoke('pd:resolve', id, as, f),
  undo: () => ipcRenderer.invoke('pd:undo'),
  mode: (m) => ipcRenderer.invoke('pd:mode', m),
  aiEdit: (text) => ipcRenderer.invoke('pd:aiEdit', text),
  back: () => ipcRenderer.invoke('pd:back'),
  pause: () => ipcRenderer.invoke('pd:winPause'),
  commit: () => ipcRenderer.invoke('pd:commit'),
  onUpdate: (fn) => ipcRenderer.on('pd:update', (_e, p) => fn(p)),
});
