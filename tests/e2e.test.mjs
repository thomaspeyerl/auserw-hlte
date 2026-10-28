// Browser-Test: spielt komplette Runden in Chromium durch (Multitouch und Maus).
// Wird übersprungen, wenn Playwright nicht installiert ist (npm i -D playwright && npx playwright install chromium).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

let chromium=null;
try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{}
const skip=!chromium&&'Playwright ist nicht installiert';
const url=new URL('../auserwaehlt/index.html',import.meta.url).href;

const isGL=page=>page.evaluate(()=>document.body.classList.contains('gl'));

async function open(browser,opts){
  const page=await browser.newPage(opts),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort()); // Tests ohne Netz
  await page.goto(url);
  await page.evaluate(()=>{window.__results=[];addEventListener('auserw:result',e=>__results.push(e.detail));});
  return {page,errors};
}
const nextResult=(page,n)=>page.waitForFunction(n=>__results.length>=n,n,{timeout:60000}).then(()=>page.evaluate(n=>__results[n-1],n));
const msg=page=>page.$eval('#msg',e=>e.textContent);

test('Handy: vier Finger gleichzeitig, Countdown 3–2–1, sichtbare Markierung endet auf dem gezogenen Gewinner',{skip,timeout:150000},async()=>{
  const browser=await chromium.launch();
  try{
    const {page,errors}=await open(browser,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    assert.equal(await isGL(page),true,'WebGL-Grafik sollte aktiv sein');
    const cdp=await page.context().newCDPSession(page);
    // Countdown mitschreiben: jede neu angezeigte Zahl bzw. „LOS!“
    await page.evaluate(()=>{window.__count=[];const el=document.getElementById('count');new MutationObserver(()=>{const t=el.textContent;if(t&&__count[__count.length-1]!==t)__count.push(t);}).observe(el,{childList:true,subtree:true});});
    const touchPoints=[[90,230],[300,300],[120,560],[280,640]].map(([x,y],id)=>({x,y,id}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});
    assert.match(await msg(page),/4 Spieler/);
    const r=await nextResult(page,1);
    assert.equal(r.players,4);
    assert.ok(r.winner>=0&&r.winner<4);
    assert.equal(r.highlighted,r.winner,'Markierung und gezogener Gewinner müssen übereinstimmen');
    assert.deepEqual(await page.evaluate(()=>__count),['3','2','1','LOS!'],'Countdown 3 – 2 – 1 – LOS!');
    assert.match(r.seed,/^[0-9A-F]{32}$/);
    assert.equal(await page.$eval('#title',e=>e.className),'show');
    // Alle Finger loslassen → nächste Runde beginnt von vorn
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.getElementById('msg').textContent.includes('Finger aufs'),null,{timeout:15000});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Desktop: Klick-Runden mit drei Punkten, jede Runde mit neuem Seed',{skip,timeout:150000},async()=>{
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

test('Musik-Engine: alle Spielphasen offline gerendert – hörbar, ohne Übersteuerung, Stille vor der Entscheidung',{skip,timeout:150000},async t=>{
  const browser=await chromium.launch();
  try{
    const {page,errors}=await open(browser,{viewport:{width:400,height:400}});
    const r=await page.evaluate(async()=>{
      const sr=44100,ac=new OfflineAudioContext(2,sr*17,sr),e=Music.create(ac,ac.destination);
      // Ablauf wie im Spiel: Leerlauf, Countdown, Auswahl mit steigender Energie, Herzschlag-Stille, Gewinner
      e.mode('idle',0);e.schedule(4);
      e.mode('wait',4,1.5);e.sfx.count(0,4.1);e.sfx.count(1,4.6);e.sfx.count(2,5.1);e.sfx.go(5.5);e.schedule(5.5);
      e.mode('choose',5.5);e.sfx.start(5.5);for(let i=0;i<40;i++){const tt=5.6+i*.11;e.energy(i/40);e.sfx.hop(i/40,tt);e.schedule(tt);}e.schedule(10);
      e.mode('hold',10);[0,.38,.9,1.15].forEach(d=>e.sfx.beat(10+d));e.schedule(11.5);
      e.mode('finale',11.5);e.sfx.impact(11.5);e.sfx.crown(12.05);e.sfx.firework(14);e.sfx.place(3,15);e.sfx.remove(15.5);e.schedule(17);
      const buf=await ac.startRendering(),L=buf.getChannelData(0),R=buf.getChannelData(1);
      const seg=(a,b)=>{let p=0,s=0,nan=0;for(let i=a*sr|0;i<(b*sr|0);i++){const v=Math.max(Math.abs(L[i]),Math.abs(R[i]));if(Number.isNaN(v))nan++;else{p=Math.max(p,v);s+=L[i]*L[i];}}return {peak:p,rms:Math.sqrt(s/((b-a)*sr)),nan};};
      // Musik allein in der Haltephase: gleiche Folge ohne Herzschlag rendern
      const ac2=new OfflineAudioContext(2,sr*12,sr),e2=Music.create(ac2,ac2.destination);
      e2.mode('choose',0);e2.energy(1);e2.schedule(8);e2.mode('hold',8);e2.schedule(12);
      const b2=await ac2.startRendering(),L2=b2.getChannelData(0),rms=(a,b)=>{let s=0;for(let i=a*sr|0;i<(b*sr|0);i++)s+=L2[i]*L2[i];return Math.sqrt(s/((b-a)*sr));};
      return {idle:seg(.5,4),choose:seg(6,10),hold:seg(10,11.5),finale:seg(11.5,17),all:seg(0,17),musicChoose:rms(4,8),musicHold:rms(9,12)};
    });
    t.diagnostic(`RMS Leerlauf ${r.idle.rms.toFixed(3)}, Auswahl ${r.choose.rms.toFixed(3)}, Gewinner ${r.finale.rms.toFixed(3)}; Spitze gesamt ${r.all.peak.toFixed(3)}; Musik Auswahl ${r.musicChoose.toFixed(3)} → Haltephase ${r.musicHold.toFixed(4)}`);
    assert.equal(r.all.nan,0,'keine ungültigen Samples');
    assert.ok(r.all.peak<1,`Übersteuerung: Spitze ${r.all.peak}`);
    for(const k of ['idle','choose','finale'])assert.ok(r[k].rms>.01,`${k} zu leise: ${r[k].rms}`);
    assert.ok(r.choose.rms>r.idle.rms*1.8,`die Auswahl muss deutlich treibender sein als der Leerlauf: ${r.choose.rms} vs ${r.idle.rms}`);
    assert.ok(r.musicHold<r.musicChoose*.25,`vor der Entscheidung muss die Musik fast verstummen: ${r.musicHold} vs ${r.musicChoose}`);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('Ohne WebGL: Ersatz-Grafik mit Canvas 2D spielt eine komplette Runde',{skip,timeout:150000},async()=>{
  const browser=await chromium.launch({args:['--disable-3d-apis']});
  try{
    const {page,errors}=await open(browser,{viewport:{width:1280,height:800}});
    assert.equal(await isGL(page),false,'ohne WebGL muss die 2D-Ersatzgrafik laufen');
    for(const [x,y] of [[400,300],[880,300],[640,600]])await page.mouse.click(x,y);
    const r=await nextResult(page,1);
    assert.equal(r.players,3);assert.equal(r.highlighted,r.winner);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
