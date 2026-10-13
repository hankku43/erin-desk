'use strict';
// 📓 艾琳的筆記本（plandraft.html）用：只開放這一週的讀寫、說話、勾目標、寫進計畫檔
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pd', {
  get: () => ipcRenderer.invoke('pd:get'),
  switchWeek: (which) => ipcRenderer.invoke('pd:switch', which),
  say: (text) => ipcRenderer.invoke('pd:say', text),
  undoLog: (logId) => ipcRenderer.invoke('pd:undoLog', logId),
  edit: (id, f) => ipcRenderer.invoke('pd:edit', id, f),
  remove: (id) => ipcRenderer.invoke('pd:remove', id),
  restore: (id) => ipcRenderer.invoke('pd:restore', id),
  add: (kind, f) => ipcRenderer.invoke('pd:add', kind, f),
  resolve: (id, as, f) => ipcRenderer.invoke('pd:resolve', id, as, f),
  undo: () => ipcRenderer.invoke('pd:undo'),
  wipe: () => ipcRenderer.invoke('pd:wipe'),
  discard: () => ipcRenderer.invoke('pd:discard'),
  check: (id, step, done) => ipcRenderer.invoke('pd:check', id, step, done),
  submit: (id) => ipcRenderer.invoke('pd:submit', id),
  rowDone: (id, done) => ipcRenderer.invoke('pd:rowDone', id, done),
  book: (book, day) => ipcRenderer.invoke('pd:book', book, day),
  setFont: (on) => ipcRenderer.invoke('pd:font', on),
  splitPreview: (id, o) => ipcRenderer.invoke('pd:splitPreview', id, o),
  split: (id, o) => ipcRenderer.invoke('pd:split', id, o),
  suggest: (id, o) => ipcRenderer.invoke('pd:suggest', id, o),
  close: () => ipcRenderer.invoke('pd:close'),
  commit: () => ipcRenderer.invoke('pd:commit'),
  onUpdate: (fn) => ipcRenderer.on('pd:update', (_e, p) => fn(p)),
  onNotify: (fn) => ipcRenderer.on('pd:notify', (_e, p) => fn(p)), // 艾琳的提醒、團戰開始／結束（主視窗藏著的時候也看得到）
});
