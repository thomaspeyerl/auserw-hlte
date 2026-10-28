// Browser-Tests für Last Finger Standing: komplette Spiele in Chromium (Multitouch, Ersatz-Grafik) und die neuen Soundeffekte.
// Wird übersprungen, wenn Playwright nicht installiert ist.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

let chromium=null;
try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{}
const skip=!chromium&&'Playwright ist nicht installiert';
const url=new URL('../lastfinger/index.html',import.meta.url).href;

async function open(browser,opts){
  const page=await browser.newPage(opts),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.goto(url);
  await page.evaluate(()=>{window.__outs=[];window.__res=[];window.__count=[];
    addEventListener('lfs:out',e=>__outs.push(e.detail));addEventListener('lfs:result',e=>__res.push(e.detail));
    const el=document.getElementById('count');new MutationObserver(()=>{const t=el.textContent;if(t&&__count[__count.length-1]!==t)__count.push(t);}).observe(el,{childList:true,subtree:true});});
  return {page,errors};
}
const result=page=>page.waitForFunction(()=>__res.length>0,null,{timeout:120000}).then(()=>page.evaluate(()=>({outs:__outs,res:__res[0],count:__count})));

function checkGame({outs,res,count},n){
  assert.equal(res.players,n);
  assert.equal(outs.length,n-1,'n−1 Explosionen');
  outs.forEach((o,i)=>{
    assert.equal(o.highlighted,o.idx,'die Bombe explodiert dort, wo sie sichtbar steht');
    assert.equal(o.idx,o.planned,'und genau beim vorab geplanten Opfer');
    assert.equal(o.place,n-i,'Plätze von hinten nach vorn');});
  assert.deepEqual(res.elim,outs.map(o=>o.idx));
  assert.equal(res.winner,res.plannedWinner);
  assert.ok(!res.elim.includes(res.winner),'der Sieger ist nicht ausgeschieden');
  assert.deepEqual([...res.elim,res.winner].sort((a,b)=>a-b),[...Array(n).keys()]);
  assert.deepEqual(count.slice(0,4),['3','2','1','LOS!'],'Countdown vor dem Start');
  assert.equal(count[count.length-1],'FINALE','Ansage vor dem letzten Duell');
}

test('Handy: Spiel mit vier Fingern bis zum Überlebenden',{skip,timeout:200000},async()=>{
  const browser=await chromium.launch();
  try{
    const {page,errors}=await open(browser,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    assert.equal(await page.evaluate(()=>document.body.classList.contains('gl')),true);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[[90,230],[300,300],[120,560],[280,640]].map(([x,y],id)=>({x,y,id}))});
    const g=await result(page);checkGame(g,4);
    assert.ok(g.count.includes('RUNDE 2'),'Rundenansage');
    assert.equal(await page.$eval('#title',e=>e.className+'|'+e.textContent),'show|ÜBERLEBT!');
    assert.equal(await page.$$eval('.tomb',els=>els.map(e=>e.textContent).join(',')),'Platz 4,Platz 3,Platz 2');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.getElementById('msg').textContent.includes('Finger aufs')&&!document.querySelector('.tomb'),null,{timeout:20000});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Ohne WebGL: Ersatz-Grafik spielt ein Spiel mit drei Punkten',{skip,timeout:200000},async()=>{
  const browser=await chromium.launch({args:['--disable-3d-apis']});
  try{
    const {page,errors}=await open(browser,{viewport:{width:1280,height:800}});
    assert.equal(await page.evaluate(()=>document.body.classList.contains('gl')),false);
    for(const [x,y] of [[400,300],[880,300],[640,600]])await page.mouse.click(x,y);
    checkGame(await result(page),3);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Soundeffekte Explosion und Lunte: hörbar, ohne Übersteuerung',{skip,timeout:90000},async()=>{
  const browser=await chromium.launch();
  try{
    const {page,errors}=await open(browser,{viewport:{width:400,height:400}});
    const r=await page.evaluate(async()=>{const sr=44100,ac=new OfflineAudioContext(2,sr*4,sr),e=Music.create(ac,ac.destination);
      e.setMusic(false,0);e.sfx.fuse(.2,.8);e.sfx.boom(1);e.sfx.boom(2.4);
      const b=await ac.startRendering(),L=b.getChannelData(0);let p=0,s=0,nan=0;for(const v of L){if(Number.isNaN(v))nan++;else{p=Math.max(p,Math.abs(v));s+=v*v;}}
      return {peak:p,rms:Math.sqrt(s/L.length),nan};});
    assert.equal(r.nan,0);assert.ok(r.peak<1,`Spitze ${r.peak}`);assert.ok(r.rms>.01,`zu leise: ${r.rms}`);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
