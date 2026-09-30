// 多顯示器測試（xvfb + xrandr 虛擬兩台螢幕）
module.exports = ({ win, engine, app }) => {
  const { screen, ipcMain } = require('electron');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const b = () => JSON.stringify(win.getBounds());
  const emit = (ch, ...a) => ipcMain.emit(ch, { sender: win.webContents }, ...a);
  win.webContents.once('did-finish-load', async () => {
    try {
      const ds = screen.getAllDisplays().map((d) => `${d.id}:${d.bounds.x},${d.bounds.y} ${d.bounds.width}x${d.bounds.height}`);
      console.log('displays', ds.join(' | '), 'start', b());
      await wait(800);
      win.setPosition(2500, 200); emit('win:dragEnd'); await wait(400);
      console.log('moved to 2nd', b());
      await win.webContents.executeJavaScript(`document.querySelector('#dlgMini').click()`); await wait(800);
      console.log('mini on 2nd', b());
      await win.webContents.executeJavaScript(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`); await wait(800);
      console.log('expanded', b());
      if (process.env.PIN) {
        const d1 = screen.getAllDisplays().sort((a, c) => a.bounds.x - c.bounds.x)[0];
        engine.state.ui.display = { id: d1.id, sig: `${d1.bounds.x},${d1.bounds.y},${d1.bounds.width}x${d1.bounds.height}` };
        win.setPosition(2400, 250); emit('win:dragEnd'); await wait(500);
        console.log('pinned d1, dragged to d2 → snapped', b());
      }
    } catch (e) { console.error('TEST FAIL', e); }
    app.quit();
  });
};
