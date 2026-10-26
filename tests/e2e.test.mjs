// Browser-Test: spielt komplette Runden in Chromium durch (Multitouch und Maus).
// Wird übersprungen, wenn Playwright nicht installiert ist (npm i -D playwright && npx playwright install chromium).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

let chromium=null;
try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{}
const skip=!chromium&&'Playwright ist nicht installiert';
const url=new URL('../index.html',import.meta.url).href;

async function open(browser,opts){
  const page=await browser.newPage(opts),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort()); // Tests ohne Netz
  await page.goto(url);
  await page.evaluate(()=>{window.__results=[];addEventListener('auserw:result',e=>__results.push(e.detail));});
  return {page,errors};
}
const nextResult=(page,n)=>page.waitForFunction(n=>__results.length>=n,n,{timeout:30000}).then(()=>page.evaluate(n=>__results[n-1],n));
const msg=page=>page.$eval('#msg',e=>e.textContent);

test('Handy: vier Finger gleichzeitig, sichtbare Markierung endet auf dem gezogenen Gewinner',{skip,timeout:90000},async()=>{
  const browser=await chromium.launch();
  try{
    const {page,errors}=await open(browser,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const cdp=await page.context().newCDPSession(page);
    const touchPoints=[[90,230],[300,300],[120,560],[280,640]].map(([x,y],id)=>({x,y,id}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});
    assert.match(await msg(page),/4 Spieler/);
    const r=await nextResult(page,1);
    assert.equal(r.players,4);
    assert.ok(r.winner>=0&&r.winner<4);
    assert.equal(r.highlighted,r.winner,'Markierung und gezogener Gewinner müssen übereinstimmen');
    assert.match(r.seed,/^[0-9A-F]{32}$/);
    assert.equal(await page.$eval('#title',e=>e.className),'show');
    // Alle Finger loslassen → nächste Runde beginnt von vorn
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.getElementById('msg').textContent.includes('Finger aufs'),null,{timeout:15000});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Desktop: Klick-Runden mit drei Punkten, jede Runde mit neuem Seed',{skip,timeout:90000},async()=>{
  const browser=await chromium.launch();
  try{
    const {page,errors}=await open(browser,{viewport:{width:1280,height:800}});
    const seeds=[];
    for(let round=1;round<=2;round++){
      for(const [x,y] of [[400,300],[880,300],[640,600]])await page.mouse.click(x,y);
      const r=await nextResult(page,round);
      assert.equal(r.players,3);assert.equal(r.round,round);
      assert.equal(r.highlighted,r.winner);
      seeds.push(r.seed);
      await page.waitForFunction(()=>document.getElementById('hint').textContent.includes('Klick'),null,{timeout:10000});
      await page.mouse.click(640,400); // Klick startet die nächste Runde
    }
    assert.notEqual(seeds[0],seeds[1]);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
