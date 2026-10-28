// Browser-Tests für Königsfinger: komplette Partien in Chromium (Bots bauen und wetten), Online-Modus mit drei Handys.
// Wird übersprungen, wenn Playwright fehlt. Der Online-Test läuft nur mit KF_ONLINE=<Basis-URL>, z. B. gegen `wrangler dev`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

let chromium=null;
try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{}
const skip=!chromium&&'Playwright ist nicht installiert';
const ROOT=fileURLToPath(new URL('..',import.meta.url));
const TYPES={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const ARGS=['--use-angle=swiftshader','--enable-unsafe-swiftshader'];

// ES-Module laden nicht über file:// – kleiner Webserver für das Repo
async function serve(){const srv=createServer(async(req,res)=>{try{let p=normalize(decodeURIComponent(new URL(req.url,'http://x').pathname));if(p.endsWith('/'))p+='index.html';
    const body=await readFile(join(ROOT,p));res.writeHead(200,{'Content-Type':TYPES[extname(p)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));return {srv,base:`http://127.0.0.1:${srv.address().port}`};}

async function playOffline(browser,base,query,viewport){
  const page=await browser.newPage({viewport,hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__st=[];window.__rounds=[];window.__res=null;window.__h=[];
    addEventListener('kf:strike',e=>__st.push({target:e.detail.st.target,reticle:e.detail.reticle,type:e.detail.st.type}));
    window.__ch=0;addEventListener('kf:choices',e=>{__ch+=e.detail.length;});addEventListener('kf:round',e=>__rounds.push(e.detail));addEventListener('kf:result',e=>{__res=e.detail;});addEventListener('kf:herald',e=>__h.push(e.detail));});
  await page.goto(`${base}/koenigsfinger/?auto=1&q=.35&${query}`);
  await page.waitForFunction(()=>__res&&!document.getElementById('result').classList.contains('hide'),null,{timeout:420000,polling:1000});
  const out=await page.evaluate(()=>({st:__st,rounds:__rounds.map(r=>({strikes:r.strikes.map(s=>s.target),winner:r.winner})),res:{winner:__res.winner,ranking:__res.ranking,rounds:__res.rounds,seed:__res.seed},
    title:document.getElementById('resTitle').textContent,h:__h,choices:__ch,labels:document.querySelectorAll('#labels .lab').length}));
  await page.close();return {...out,errors};}

function check(o,n){
  assert.deepEqual(o.errors,[]);
  assert.equal(o.labels,n,'ein Namensschild pro Burg');
  const planned=o.rounds.flatMap(r=>r.strikes);
  assert.deepEqual(o.st.map(s=>s.target),planned,'jeder Einschlag wird gezeigt, in der geplanten Reihenfolge');
  for(const s of o.st)assert.equal(s.reticle,s.target,'das Fadenkreuz bleibt auf dem Ziel stehen');
  assert.equal(o.rounds[o.rounds.length-1].winner,o.res.winner);
  assert.equal(o.res.ranking[0].id,o.res.winner);assert.equal(o.res.ranking.length,n);
  assert.ok(o.title.includes(o.res.ranking[0].name),'die Krone geht an den Sieger');
  assert.match(o.res.seed,/^[0-9A-F]{32}$/);
  assert.ok(o.h.some(t=>/König|Kron|Majestät/.test(t)),'der Herold krönt');
}

test('Am Tisch: vier Spieler im Hochformat, alle Angreifer, eigenes Ziel, Buffs unbegrenzt',{skip,timeout:480000},async()=>{
  const {srv,base}=await serve();const browser=await chromium.launch({args:ARGS});
  try{const o=await playOffline(browser,base,'speed=8&names=Anna,Bert,Cleo,Dora&boostType=ziel&stack=viele&cam=kurz',{width:390,height:844});check(o,4);
    assert.ok(o.choices>0,'Getroffene haben gewählt');
    assert.ok(o.h.some(t=>/tippt|Burg/.test(t)),'Bauaufforderung');}
  finally{await browser.close();srv.close();}
});

test('Am Tisch: drei Spieler quer, Doppelschaden, nur Fluch und Drache, ohne Geisterfluch',{skip,timeout:480000},async()=>{
  const {srv,base}=await serve();const browser=await chromium.launch({args:ARGS});
  try{const o=await playOffline(browser,base,'speed=8&names=Xaver,Yvonne,Zenzi&boostType=doppel&stack=eins&tempo=kurz&noghost&nokill&attacks=fluch,drache&preset=nacht',{width:860,height:420});check(o,3);
    for(const s of o.st)assert.ok(['fluch','drache'].includes(s.type));}
  finally{await browser.close();srv.close();}
});

const ONLINE=process.env.KF_ONLINE;
test('Online: Gastgeber und zwei Gäste spielen eine Partie, alle sehen dasselbe Ergebnis',{skip:skip||(!ONLINE&&'KF_ONLINE nicht gesetzt'),timeout:600000},async()=>{
  const browser=await chromium.launch({args:ARGS});const q='bot=1&speed=6&q=.3&cam=kurz';const pages=[];
  const mk=async(name,url)=>{const ctx=await browser.newContext({viewport:{width:360,height:640},hasTouch:true});
    await ctx.addInitScript(n=>{localStorage.setItem('kf.myName',JSON.stringify(n));localStorage.setItem('kf.seenRules','true');},name);
    const p=await ctx.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));await p.goto(url);pages.push(p);return p;};
  try{const host=await mk('Hanna',`${ONLINE}/koenigsfinger/?${q}`);await host.click('#bOnline');await host.click('#bCreate');
    await host.waitForFunction(()=>/^[A-Z0-9]{4}$/.test(document.getElementById('roomCode').textContent));const code=await host.textContent('#roomCode');
    await mk('Gustl',`${ONLINE}/koenigsfinger/?${q}&raum=${code}`);await mk('Resi',`${ONLINE}/koenigsfinger/?${q}&raum=${code}`);
    await host.waitForFunction(()=>document.querySelectorAll('#members .mem:not(.off)').length===3,null,{timeout:30000});
    await host.click('#bRoomStart');
    for(const p of pages)await p.waitForFunction(()=>!document.getElementById('result').classList.contains('hide'),null,{timeout:560000,polling:2000});
    const res=await Promise.all(pages.map(p=>p.evaluate(()=>[document.getElementById('resTitle').textContent,document.getElementById('resRank').textContent.replace(/\s+/g,' ')])));
    assert.deepEqual(res[1],res[0]);assert.deepEqual(res[2],res[0]);
    assert.deepEqual(pages.flatMap(p=>p.errors),[]);}
  finally{await browser.close();}
});
