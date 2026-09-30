'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getView: () => ipcRenderer.invoke('view:get'),
  greet: () => ipcRenderer.invoke('npc:greet'),
  daily: () => ipcRenderer.invoke('npc:daily'),
  poke: () => ipcRenderer.invoke('npc:poke'),
  chat: (text) => ipcRenderer.invoke('npc:chat', text),
  confirmProposal: (id, keep) => ipcRenderer.invoke('npc:confirm', id, keep),
  cancelProposal: () => ipcRenderer.invoke('npc:cancel'),
  checkStatus: () => ipcRenderer.invoke('npc:status'),
  toggleAI: () => ipcRenderer.send('ai:toggle'),
  setObjective: (qid, idx, done) => ipcRenderer.invoke('quest:objective', qid, idx, done),
  submit: (qid, report) => ipcRenderer.invoke('quest:submit', qid, report),
  setActive: (qid) => ipcRenderer.invoke('quest:active', qid),
  toggleDaily: (rowId, done) => ipcRenderer.invoke('daily:toggle', rowId, done),
  chooseBranch: (date, which) => ipcRenderer.invoke('daily:branch', date, which),
  dailyReport: (fields) => ipcRenderer.invoke('daily:report', fields),
  addQuest: (f) => ipcRenderer.invoke('plan:addQuest', f),
  editQuest: (id, f) => ipcRenderer.invoke('plan:editQuest', id, f),
  deleteQuest: (id) => ipcRenderer.invoke('plan:deleteQuest', id),
  addObjective: (id, text) => ipcRenderer.invoke('plan:addObjective', id, text),
  deleteObjective: (id, i) => ipcRenderer.invoke('plan:deleteObjective', id, i),
  addRow: (date, f) => ipcRenderer.invoke('plan:addRow', date, f),
  deleteRow: (rowId) => ipcRenderer.invoke('plan:deleteRow', rowId),
  addReminder: (f) => ipcRenderer.invoke('plan:addReminder', f),
  deleteReminder: (id) => ipcRenderer.invoke('plan:deleteReminder', id),
  importIcs: () => ipcRenderer.invoke('ics:import'),
  exportIcs: () => ipcRenderer.invoke('ics:export'),
  setSmart: (on) => ipcRenderer.invoke('smart:set', on),
  setIgnoreMouse: (ignore) => ipcRenderer.send('win:ignore', ignore),
  moveWindow: (dx, dy) => ipcRenderer.send('win:move', { dx, dy }),
  dragEnd: () => ipcRenderer.send('win:dragEnd'),
  openMenu: () => ipcRenderer.send('win:menu'),
  setMini: (on) => ipcRenderer.send('win:mini', on),
  on: (channel, fn) => {
    const allowed = ['view:update', 'npc:lines', 'ui:open', 'ui:mini', 'ui:shrink'];
    if (!allowed.includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
