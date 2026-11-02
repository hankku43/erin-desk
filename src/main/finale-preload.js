'use strict';
// 💗 終章視窗（finale.html，好感第 5 階的舞台）用：只開放拿資料和結束兩件事
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('finale', {
  init: () => ipcRenderer.invoke('finale:init'),
  finish: (r) => ipcRenderer.invoke('finale:finish', r),
});
