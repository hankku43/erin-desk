'use strict';
// 🎬 開場視窗（opening.html）用：只開放拿資料和結束兩件事
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opening', {
  init: () => ipcRenderer.invoke('opening:init'),
  finish: (r) => ipcRenderer.invoke('opening:finish', r),
});
