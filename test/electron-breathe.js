module.exports=({win,app})=>{const wc=win.webContents;const js=c=>wc.executeJavaScript(c);const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tf=()=>js(`getComputedStyle(document.querySelector('#npcImg')).transform`);
const cls=()=>js(`document.querySelector('#npcWrap').className`);
wc.once('did-finish-load',async()=>{try{
 await wait(2500);
 const a=await tf(); await wait(900); const b=await tf(); console.log('idle breathing:', a!==b?'moving':'STUCK');
 // 點角色 → 跳
 await js(`(()=>{const w=document.querySelector('#npcWrap');w.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
 await wait(300); console.log('during jump class:', await cls());
 await wait(1500); console.log('after jump class:', await cls());
 const c=await tf(); await wait(900); const d=await tf(); console.log('after jump breathing:', c!==d?'moving':'STUCK');
 // 說話中
 await js(`document.querySelector('#npcWrap').classList.add('talking')`);
 const e=await tf(); await wait(900); const f=await tf(); console.log('while talking breathing:', e!==f?'moving':'STUCK');
 // 縮小
 await js(`document.querySelector('#dlgMini').click()`); await wait(1000);
 const g=await tf(); await wait(900); const h=await tf(); console.log('mini breathing:', g!==h?'moving':'STUCK');
}catch(e){console.error('TEST FAIL',e)}app.quit();});};
