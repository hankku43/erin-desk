module.exports=({win,app})=>{const wc=win.webContents;const wait=ms=>new Promise(r=>setTimeout(r,ms));const js=c=>wc.executeJavaScript(c);
const click=()=>js(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
const text=()=>js(`document.querySelector('#dlgText').textContent`);
wc.on('console-message',(_e,l,m)=>{if(l>=2)console.log('[renderer]',m);});
wc.once('did-finish-load',async()=>{try{
 await wait(2800); const t1=await text(); console.log('before mini:', t1.slice(0,40));
 await js(`document.querySelector('#dlgMini').click()`); await wait(1600);
 await click(); await wait(1500); const t2=await text(); console.log('after expand:', t2.slice(0,40), '| same:', t1===t2);
 // 縮小期間收到提醒 → 展開要說提醒
 await js(`document.querySelector('#dlgMini').click()`); await wait(1600);
 wc.send('npc:lines',[{text:'決策時間到了！',emotion:'thinking',event:'reminder'}]); await wait(400);
 await click(); await wait(2500); console.log('after expand w/ pending:', (await text()).slice(0,40));
}catch(e){console.error('TEST FAIL',e)}app.quit();});};
