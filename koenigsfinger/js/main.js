// Königsfinger – Spielablauf, Oberfläche, Online-Modus.
// Aufbau: Der Ablauf (runMatch/runGame) rechnet mit rules.js und erzeugt „Schritte“ ({k:'strike',…}).
// Jeder Schritt wird lokal mit present() in Grafik, Ton und Text umgesetzt – im Online-Modus schickt der
// Gastgeber dieselben Schritte an alle Handys, die sie genauso abspielen.
import {World,PRESETS} from './world.js';
import {createAudio} from './audio.js';
import * as R from './rules.js';
import {say,joinNames} from './herald.js';
import {Net,createRoom,lobbyList,roomInfo,qrSvg,shareBase,clientId} from './net.js';

const $=id=>document.getElementById(id);
const Q=new URLSearchParams(location.search);
const SPEED=Math.max(.1,+Q.get('speed')||1),AUTO=Q.has('auto'),BOT=AUTO||Q.has('bot'),FIXQ=+Q.get('q')||0;
const store={get(k,d){try{const v=localStorage.getItem('kf.'+k);return v==null?d:JSON.parse(v);}catch{return d;}},set(k,v){try{localStorage.setItem('kf.'+k,JSON.stringify(v));}catch{}}};
const ABORT=new Error('abgebrochen');
const emitEv=(n,d)=>dispatchEvent(new CustomEvent('kf:'+n,{detail:d}));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const NEUTRAL='#a89a86';
const RET_COL={katapult:[1,.55,.15],drache:[1,.25,.1],pulver:[1,.85,.2],fluch:[.75,.3,1]};
const BUZZ={katapult:[90,40,180],drache:[30,30,30,30,30,30,220],pulver:[320,60,120],fluch:[60,90,60,90,420],fall:[200,80,450],shield:[20,25,20,25,20]};
const ONLINE_REGION={x:7,z0:-6,z1:7.5};
const DEFAULTS={attacks:[...R.ATTACKS],boostType:'extra',stack:'je',tempo:'mittel',ghostCurse:true,cam:'skip',killcam:true,match:1,camFx:true};
const FLY={kurz:1.3,film:4,skip:4};

/* ---------- 3D-Welt ---------- */
let world;
try{world=new World($('gl'));}catch(e){console.warn(e);$('nogl').classList.remove('hide');$('menu').classList.add('hide');$('fade').style.opacity=0;throw e;}
let cfg={...DEFAULTS,...store.get('settings',{})};delete cfg.betMode;
world.effects=cfg.camFx;if(FIXQ){world.q=FIXQ;world.resize();}

/* ---------- Ton ---------- */
let audio=null,soundOn=store.get('sound',true),curMood='menu',curEnergy=0;
function initAudio(){if(audio)return;const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
  try{const ac=new A({latencyHint:'interactive'});audio=createAudio(ac,ac.destination);audio.setSfx(soundOn,.01);audio.setMusic(soundOn,.01);audio.start();audio.setMood(curMood,curEnergy);}catch(e){console.warn(e);}}
addEventListener('pointerdown',()=>{initAudio();if(audio&&audio.ac.state==='suspended'&&!paused)audio.ac.resume();},{capture:true});
const sfx=new Proxy({},{get:(_,k)=>(...a)=>{try{if(audio&&soundOn)audio.sfx[k](...a);}catch(e){console.warn(e);}}});
const at=d=>audio?audio.ac.currentTime+d/SPEED:0;
function mood(m,e=0){curMood=m;curEnergy=e;if(audio)audio.setMood(m,e);}
const buzz=p=>{try{navigator.vibrate&&navigator.vibrate(p);}catch{}};
function setSound(on){soundOn=on;store.set('sound',on);$('snd1').classList.toggle('hide',!on);$('snd0').classList.toggle('hide',on);if(audio){audio.setSfx(on);audio.setMusic(on);}}
setSound(soundOn);
world.onThunder=()=>sfx.thunder(0,.6);world.onFirework=()=>sfx.firework();
// Geräusche aus der Welt (Schreie und Tiere mit Mindestabstand, damit es nicht zum Brei wird)
const limited=(fn,gap)=>{let last=-9;return()=>{const t=performance.now()/1000;if(t-last>gap/SPEED){last=t;fn();}};};
world.onScream=limited(()=>sfx.scream(0,.9+Math.random()*.5,.7),.25);world.onMoo=limited(()=>sfx.moo(),.8);world.onBaa=limited(()=>sfx.baa(),.6);
world.onCaw=limited(()=>sfx.caw(),1.5);world.onCackle=()=>sfx.cackle();world.onCrank=()=>sfx.crank();world.onThud=()=>sfx.thud();world.onLand=()=>sfx.land();
world.onBrick=limited(()=>sfx.brick(),.05);world.onSplat=limited(()=>sfx.gore(0,.6),.2);

/* ---------- Abbrechbare Abläufe ---------- */
let ctl=new AbortController();
function newRun(){ctl.abort();ctl=new AbortController();tapHandler=null;chooser=null;promptTimer=null;world.ts=1;world.endFly();return ctl.signal;}
function guard(p){const s=ctl.signal;return new Promise((res,rej)=>{if(s.aborted)return rej(ABORT);s.addEventListener('abort',()=>rej(ABORT),{once:true});p.then(res,rej);});}
const wait=t=>guard(world.wait(t));
const quiet=p=>p.catch(e=>{if(e!==ABORT)console.error(e);});

/* ---------- Bildschirme ---------- */
const SCREENS=['menu','setup','online','room','hall','rules','pause','result'];
function show(id){SCREENS.forEach(s=>$(s).classList.toggle('hide',s!==id));}
const hideScreens=()=>show(null);

/* ---------- Herold, Aufforderung, Countdown ---------- */
let heraldTimer=0;
function herald(text,{dur=2.8,fanfare=false}={}){$('heraldText').textContent=text;const h=$('herald');h.classList.remove('on');void h.offsetWidth;h.classList.add('on');
  clearTimeout(heraldTimer);heraldTimer=setTimeout(()=>h.classList.remove('on'),dur*1000/SPEED);if(fanfare)sfx.horn();emitEv('herald',text);}
let promptTimer=null,lastTick=-1;
function prompt(html,{secs=0}={}){$('promptText').innerHTML=html;$('prompt').classList.remove('hide');$('chips').innerHTML='';
  promptTimer=secs?{t0:world.time,dur:secs}:null;lastTick=-1;$('timer').classList.toggle('hide',!secs);}
function hidePrompt(){$('prompt').classList.add('hide');promptTimer=null;}
function showCount(t,go=false){$('count').innerHTML=`<span class="${go?'go':''}">${esc(t)}</span>`;}

/* ---------- Spielansicht: Spieler, Namensschilder mit Türmen, Schilden und Boosts ---------- */
let view={players:[],me:null,finale:false};
const labels=new Map();
function resetLabels(){labels.clear();$('labels').innerHTML='';}
const newPlayer=(name,id)=>({id,name,color:NEUTRAL,crestIcon:'',crest:'',towers:R.TOWERS,alive:true,shields:0,boosts:0,curseUsed:false,revenge:0,x:0,z:0,placed:false});
function label(p){let el=labels.get(p.id);if(!el){el=document.createElement('div');el.className='lab';$('labels').appendChild(el);labels.set(p.id,el);el._k='';}
  const key=[p.name,p.color,p.crestIcon,p.towers,p.alive,p.shields,p.boosts,p.curseUsed,view.me===p.id].join('|');if(key===el._k)return el;el._k=key;
  el.classList.toggle('dead',!p.alive);el.classList.toggle('me',view.me===p.id);
  const tw=Array.from({length:R.TOWERS},(_,i)=>`<span class="${i<p.towers?'':'d'}">♜</span>`).join('');
  const buffs=(p.shields?`<span class="bf sh">🛡${p.shields>1?p.shields:''}</span>`:'')+(p.boosts?`<span class="bf bo">🔥${p.boosts>1?p.boosts:''}</span>`:'')+(!p.alive&&cfg.ghostCurse&&!p.curseUsed?'<span class="bf gh">☠</span>':'');
  el.innerHTML=`<div class="buffs">${buffs}</div><div class="nm" style="background:${p.color}"><span class="ic">${p.alive?p.crestIcon||'🏰':'👻'}</span>${esc(p.name)}</div>${p.alive?`<div class="tw">${tw}</div>`:''}`;return el;}
function updateLabels(){for(const p of view.players){if(!p.placed)continue;const c=world.castle(p.id);if(!c)continue;const el=label(p);
    const s=world.project([c.x,c.y+(c.fallen?2.7:2.35),c.z]);el.style.opacity=s.vis?1:0;el.style.transform=`translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%)`;}}
const P=id=>view.players[id];

/* ---------- Eingabe ---------- */
let tapHandler=null,chooser=null;
$('gl').addEventListener('pointerdown',e=>{if(tapHandler)tapHandler(e.clientX,e.clientY);});
function chips(ids,fin){$('chips').innerHTML='';for(const id of ids){const p=P(id),b=document.createElement('button');b.className='chip';b.style.background=p.color;
  b.innerHTML=`<span class="ic">${p.crestIcon||'🏰'}</span>${esc(p.name)}`;b.onclick=()=>fin(id);$('chips').appendChild(b);}}
/* Burg auswählen (Wette): Tipp auf die Burg oder auf ein Namensschild unten; nach secs Sekunden ohne Wahl → null */
function choose(ids,secs){return guard(new Promise(res=>{let done=false;
  const fin=v=>{if(done)return;done=true;if(chooser===c)chooser=null;tapHandler=null;promptTimer=null;$('chips').innerHTML='';res(v);};const c={fin};chooser=c;
  tapHandler=(x,y)=>{const id=world.pickCastle(x,y,ids);if(id!=null)fin(id);};chips(ids,fin);
  if(secs)world.after(secs,()=>fin(null));
  if(BOT)world.after(Math.min(.5,secs*.2)+Math.random()*.4,()=>fin(ids[Math.floor(Math.random()*ids.length)]));}));}
/* Frage mit zwei großen Knöpfen (z. B. Boost oder Schild); nach secs Sekunden → null */
function ask2(a,b,secs){return guard(new Promise(res=>{let done=false;const fin=v=>{if(done)return;done=true;if(chooser===c)chooser=null;promptTimer=null;$('chips').innerHTML='';res(v);};const c={fin};chooser=c;
  $('chips').innerHTML='';for(const [k,txt,cls] of [['a',a,'gold'],['b',b,'']]){const bt=document.createElement('button');bt.className='btn big '+cls;bt.textContent=txt;bt.onclick=()=>{sfx.click();fin(k);};$('chips').appendChild(bt);}
  if(secs)world.after(secs,()=>fin(null));
  if(BOT)world.after(.3+Math.random()*.5,()=>fin(Math.random()<.5?'a':'b'));}));}
/* Bauplatz wählen */
function choosePlace(region){return guard(new Promise(res=>{
  const tryAt=(x,y,silent)=>{const g=world.screenToGround(x,y);if(!g)return false;const err=world.canPlace(g.x,g.z,x,y,region);
    if(err){if(!silent){herald(say(err==='nah'?'tooClose':'edge'),{dur:1.8});sfx.click();buzz(60);}return false;}tapHandler=null;res(g);return true;};
  tapHandler=(x,y)=>tryAt(x,y,false);
  if(BOT)world.after(.3+Math.random(),()=>{for(let i=0;i<400;i++)if(tryAt(world.W*(.12+Math.random()*.76),world.H*(.24+Math.random()*.6),true))return;});}));}

/* ---------- Darstellung der Schritte ---------- */
async function present(s){
  switch(s.k){
  case 'setup':{
    world.clearCastles();world.setTitle(false);world.setPreset(s.preset);world.effects=cfg.camFx;resetLabels();hidePrompt();hideScreens();
    view={players:s.names.map(newPlayer),me:mode==='offline'?null:myIndex(s.cids),finale:false};
    $('seed').textContent='';$('pauseBtn').classList.toggle('hide',mode!=='offline');mood('taverne');
    herald(s.gameNo>1?`Partie ${s.gameNo} – ${PRESETS[s.preset].name}!`:say('welcome'),{fanfare:true,dur:3.2});await wait(1.8);break;}
  case 'placeAsk':prompt(`<b>${esc(s.name)}</b>, tippt dorthin, wo Eure Burg stehen soll!`);herald(say('place',{name:s.name}),{dur:2.4});break;
  case 'placeOpen':{world.fitCamera(regionCorners(),.1);const mine=view.me!=null&&!P(view.me).placed;
    if(mine){prompt('Tippt dorthin, wo <b>Eure Burg</b> stehen soll!');herald(say('place',{name:P(view.me).name}),{dur:2.4});quiet(placeLoop());}
    else prompt('Die anderen bauen ihre Burgen…');break;}
  case 'placeErr':if(view.me!=null&&!P(view.me).placed){herald(say(s.err==='nah'?'tooClose':'edge'),{dur:1.8});quiet(placeLoop());}break;
  case 'build':{const p=P(s.id);p.x=s.x;p.z=s.z;p.placed=true;quiet(guard(world.addCastle(s.id,s.x,s.z,NEUTRAL)));
    if(!s.fast){sfx.build();buzz([15,40,15,40,15,40,60]);}else sfx.stone(0,.5);
    if(view.me===s.id)prompt('Eure Burg steht! Warte auf die anderen…');
    await wait(s.fast?.25:1.2);break;}
  case 'paint':{hidePrompt();world.setReticle(null);for(const q of s.players){const p=P(q.id);Object.assign(p,q);world.paint(q.id,q.color);sfx.coin();await wait(.22);}
    world.fitCamera(view.players.map(p=>({x:p.x,z:p.z})));world.life.populate();herald(say('lots'),{dur:2.6});$('seed').textContent='Seed '+s.seed;await wait(1.8);break;}
  case 'round':{world.setReticle(null);hidePrompt();if(s.n>1||s.first)await camMove();mood(view.finale?'finale':'taverne');
    herald(say(s.strikes===1?'round1':'round',{n:s.n,k:s.strikes}),{fanfare:true,dur:2.6});sfx.drum();emitEv('roundStart',s);await wait(2.2);break;}
  case 'actAsk':{const p=P(s.id);prompt(p.alive?`<b>${esc(p.name)}</b>: Boost zünden? 🔥`:`👻 <b>${esc(p.name)}</b>: Burg verfluchen?`,{secs:s.secs});
    herald(say(p.alive?'fireAsk':'curseAsk',{name:p.name}),{dur:2.2});break;}
  case 'actOpen':{const me=view.me,ok=me!=null&&s.who.includes(me);prompt(ok?(P(me).alive?'Euren <b>Boost</b> jetzt zünden?':'👻 Eine Burg <b>verfluchen</b>?'):'Andere überlegen, ob sie zünden…',{secs:s.secs});
    herald(say('actSecret'),{dur:2.2});if(ok)quiet(askAct(me,s.ids,s.secs).then(r=>{if(r!==undefined){sendChoice({t:'act',to:r});prompt('Gezündet! Psst…');}else{sendChoice({t:'act',skip:true});prompt('Aufgehoben.');}}));break;}
  case 'actsClose':hidePrompt();if(chooser)chooser.fin(null);break;
  case 'fire':{const p=P(s.from),tg=s.target!=null?P(s.target):null;
    if(s.kind==='geist'){p.curseUsed=true;herald(say('ghostCurse',{name:p.name,target:tg?tg.name:'wen'}),{dur:2.6});sfx.cackle();const c=world.castle(s.from);if(c)world.burst([c.x,c.y+2,c.z],{n:80,col:[.6,1,.5],speed:4,type:0,life:1.2,add:true,size:.3,g:1});}
    else{p.boosts=Math.max(0,p.boosts-1);const key=s.boostType==='doppel'?'boostDoppel':s.boostType==='ziel'?'boostZiel':'boostExtra';herald(say(key,{name:p.name,target:tg?tg.name:''}),{fanfare:false,dur:2.6});sfx.boost();buzz([40,30,80]);
      const c=world.castle(s.from);if(c){world.explosion([c.x,c.y+2.2,c.z],[1,.45,.1],.6);world.light([c.x,c.y+2,c.z],[1,.5,.1],20,1);}}
    await wait(1.6);break;}
  case 'chooseAsk':{const p=P(s.id);prompt(`<b>${esc(p.name)}</b> wurde getroffen – was nun?`,{secs:s.secs});herald(say('choose',{name:p.name}),{dur:2.2});break;}
  case 'chooseOpen':{const me=view.me,ok=me!=null&&s.who.includes(me);prompt(ok?'Ihr wurdet getroffen! <b>Boost</b> oder <b>Schild</b>?':'Getroffene wählen Boost oder Schild…',{secs:s.secs});
    herald(say('chooseSecret'),{dur:2.2});if(ok)quiet(ask2('🔥 Angriffs-Boost','🛡 Schild',s.secs).then(c=>{if(c){sendChoice({t:'choice',c:c==='a'?'boost':'schild'});prompt('Gewählt!');}}));break;}
  case 'chosen':{hidePrompt();if(chooser)chooser.fin(null);
    for(const c of s.list){const p=P(c.id);p.shields=c.shields;p.boosts=c.boosts;world.setShield(c.id,c.shields);
      herald(say(c.choice==='boost'?'tookBoost':'tookShield',{name:p.name}),{dur:1.8});if(c.choice==='boost')sfx.boost();else sfx.shieldUp();
      const cs=world.castle(c.id);if(cs&&c.choice==='boost')world.burst([cs.x,cs.y+2,cs.z],{n:60,col:[1,.5,.1],speed:4,type:2,life:.8,add:true,size:.07,g:-3});
      await wait(1.1);}break;}
  case 'countdown':{hidePrompt();mood('schlacht',view.finale?.9:.4);for(const c of ['3','2','1']){showCount(c);sfx.countdown();buzz(40);await wait(.8);}
    showCount(say('countdown'),true);sfx.countdown(0,true);buzz([60,40,120]);await wait(.8);$('count').innerHTML='';break;}
  case 'strike':await presentStrike(s.st,s.first);break;
  case 'stechen':{herald(say('stechen'),{fanfare:true,dur:3.4});sfx.drum();await wait(1);for(const id of s.ids){world.revive(id);const p=P(id);p.towers=1;p.alive=true;p.shields=0;p.boosts=0;sfx.shieldUp();await wait(.3);}await wait(1.6);break;}
  case 'finale':view.finale=true;mood('finale');herald(say('finale'),{dur:3});sfx.heartbeat();await wait(.8);sfx.heartbeat();await wait(1.6);break;
  case 'king':{hidePrompt();world.setReticle(null);const p=P(s.id);mood('koenig');world.coronation(s.id);sfx.fanfare();sfx.bells(at(1));sfx.crowd(at(1.6),3.5);buzz([100,60,100,60,400]);
    herald(say('king',{name:p.name}),{dur:4.5});await wait(4.6);
    if(s.matchWinner!=null){herald(say('matchKing',{name:P(s.matchWinner).name}),{fanfare:true,dur:3});await wait(2.6);}
    break;}
  case 'result':showResult(s);break;
  case 'sync':applySync(s);break;
  case 'toRoom':backToRoom();break;
  case 'menu':goMenu();break;
  }
}

/* Kamerafahrt zwischen den Runden (Länge einstellbar, „überspringbar“ per Tipp) */
async function camMove(){const d=FLY[cfg.cam]||0;if(!d||!world.effects&&cfg.cam!=='kurz')return;const prev=tapHandler;
  if(cfg.cam==='skip'){tapHandler=()=>world.skipFly();$('netState').textContent='Tippen zum Überspringen';}
  try{await guard(world.flyby(d));}finally{if(cfg.cam==='skip'){tapHandler=prev;$('netState').textContent='';}}}
/* Ein Einschlag: Fadenkreuz springt (erst wild, dann im Kreis langsamer) mit Trommelwirbel, dann kommt der Angreifer sichtbar */
async function presentStrike(st,first){
  const col=RET_COL[st.type],from=st.from!=null?P(st.from):null;mood('schlacht',view.finale?1:.7);
  if(st.src==='zufall')herald(first?say('tension'):say(st.type),{dur:2.4});
  if(st.type==='drache')sfx.roar();if(st.type==='fluch')sfx.ghost();
  const n=st.path.length,tail=n-st.chaos,times=[];
  for(let i=0;i<n;i++){const k=i<st.chaos?0:(i-st.chaos+1)/Math.max(1,tail);times.push(i===n-1?.6:i<st.chaos?.12+Math.random()*.05:.16+.45*k*k);}
  if(first||n>6)sfx.drumroll(0,times.reduce((a,b)=>a+b,0)/SPEED);
  for(let i=0;i<n;i++){world.setReticle(st.path[i],col);const last=i===n-1;sfx.tick(0,last);if(i%2===0)buzz(8);await wait(times[i]);}
  if(st.src==='zufall'&&first)herald(say(st.type),{dur:2.2});
  emitEv('strike',{st,reticle:st.path[n-1]});buzz(BUZZ[st.type]);
  const hitOf=id=>st.hits.find(h=>h.id===id);const pend=[];
  if(st.type==='katapult'){sfx.creak(at(.9));sfx.whoosh(at(1.6),1.35/SPEED);await guard(world.catapult(st.target));world.setReticle(null);sfx.impact();await applyHit(st,hitOf(st.target));}
  else if(st.type==='pulver'){sfx.fuse(0,1.7/SPEED);sfx.fuse(at(1.7),1/SPEED);await guard(world.keg(st.target));world.setReticle(null);sfx.explosion();
    await applyHit(st,hitOf(st.target));
    if(st.chain!=null){herald(say('chain'),{dur:2});sfx.whoosh(0,1/SPEED);await guard(world.chain(st.target,st.chain));sfx.explosion(0,.8);await applyHit(st,hitOf(st.chain));}}
  else if(st.type==='drache'){sfx.wings(0,4.2/SPEED);world.setReticle(null);
    await guard(world.dragon(st.target,st.dir,st.targets,id=>{sfx.fire(0,.9);sfx.roar(at(.1),.8);pend.push(quiet(applyHit(st,hitOf(id))));},()=>sfx.chomp()));await guard(Promise.all(pend));}
  else if(st.type==='fluch'){sfx.curse();await guard(world.curse(st.target));world.setReticle(null);await applyHit(st,hitOf(st.target));}
  void from;await wait(.9);}
async function applyHit(st,h){if(!h)return;const p=P(h.id);
  if(h.broke){p.shields=0;world.setShield(h.id,0);herald(say('shieldBroken',{name:p.name}),{dur:2});sfx.shield();await wait(.4);}
  if(h.blocked){p.shields=h.shields;world.hitTower(h.id,true);world.setShield(h.id,h.shields);sfx.shield();buzz(BUZZ.shield);herald(say('blocked',{name:p.name}),{dur:2.2});return;}
  world.hitTower(h.id,false,st.type,h.dmg);p.towers=h.towers;p.shields=h.shields;sfx.scream(at(.08),1+Math.random()*.3);sfx.gore(at(.12));
  if(st.type!=='pulver')sfx.impact(0,.8);
  if(h.fell){await wait(.75);world.fallCastle(h.id);p.alive=false;p.shields=0;p.boosts=0;sfx.crumble();sfx.explosion(0,.7);[0,.25,.5].forEach(d=>sfx.scream(at(d),.85+Math.random()*.5));sfx.gore(at(.3),1.6);
    sfx.bell(at(1.1),45,.4);buzz(BUZZ.fall);herald(say('fall',{name:p.name}),{dur:3});
    if(cfg.killcam){sfx.slowmo();await guard(world.killcam(h.id));}
    await wait(1.6);sfx.ghost();}
  else herald(say(h.dmg>1?'double':h.towers===1?'lastTower':'hit',{name:p.name,t:h.towers}),{dur:2.2});}

/* ---------- Spielablauf (am Tisch und als Online-Gastgeber) ---------- */
let mode='offline',paused=false;
const act=(io,s)=>{io.emit(s);return present(s);};
const randPreset=()=>{const k=Object.keys(PRESETS);return k[Math.floor(Math.random()*k.length)];};

async function runMatch(io,names){
  const wins=names.map(()=>0);let positions=null,gameNo=0;
  for(;;){gameNo++;
    const r=await runGame(io,names,positions,gameNo);positions=r.positions;wins[r.winner]++;
    const need=Math.ceil((+cfg.match||1)/2),matchWinner=wins[r.winner]>=need?r.winner:null;
    const g=r.g;await act(io,{k:'king',id:r.winner,matchWinner:(+cfg.match||1)>1?matchWinner:null});
    const ranking=g.players.map(p=>({id:p.id,name:p.name,color:p.color,crestIcon:p.crestIcon,crest:p.crest,place:p.place,revenge:p.revenge,hits:p.hitsTaken})).sort((a,b)=>a.place-b.place||b.revenge-a.revenge);
    const res={k:'result',winner:r.winner,ranking,wins:wins.slice(),match:+cfg.match||1,matchWinner,gameNo,seed:g.seed,rounds:g.round};
    emitEv('result',{...res,log:g.log,players:g.players});
    await act(io,res);
    const next=await io.afterGame();
    if(next==='menu')return;
    if(matchWinner!=null){wins.fill(0);gameNo=0;positions=null;}
  }
}
async function runGame(io,names,positions,gameNo){
  await act(io,{k:'setup',preset:Q.get('preset')||randPreset(),names:names.map(n=>n.name),cids:names.map(n=>n.cid||null),gameNo});
  if(!positions)positions=await io.place(names);
  else for(let i=0;i<names.length;i++)await act(io,{k:'build',id:i,x:positions[i].x,z:positions[i].z,fast:true});
  const g=R.createGame({players:names.map((n,i)=>({name:n.name,x:positions[i].x,z:positions[i].z})),attacks:cfg.attacks,boostType:cfg.boostType,stack:cfg.stack,tempo:cfg.tempo,ghostCurse:cfg.ghostCurse});
  hostGame=g;
  await act(io,{k:'paint',seed:g.seed,players:g.players.map(p=>({id:p.id,color:p.color,crest:p.crest,crestIcon:p.crestIcon}))});
  let finaleSaid=false;
  while(!g.finished){
    const n=R.strikesFor({...g,round:g.round+1});
    await act(io,{k:'round',n:g.round+1,strikes:n,first:g.round===0});
    // Boosts zünden, Geister verfluchen
    let acts={};if(R.actors(g).length){acts=await io.acts(g);await act(io,{k:'actsClose'});
      for(const [id,t] of Object.entries(acts)){const p=g.players[id];await act(io,{k:'fire',from:+id,kind:p.alive?'boost':'geist',target:t,boostType:g.boostType});}}
    await act(io,{k:'countdown'});
    const res=R.playRound(g,acts);emitEv('round',res);
    let first=true;for(const st of res.strikes){await act(io,{k:'strike',st,first});first=false;}
    if(res.stechen){const ids=[...new Set(res.strikes.flatMap(s=>s.hits.filter(h=>h.fell).map(h=>h.id)))];await act(io,{k:'stechen',ids});}
    // Getroffene wählen Boost oder Schild
    if(res.choosers.length){const ch=await io.choices(g,res.choosers),list=[];
      for(const id of res.choosers){const c=ch[id]||'schild';R.applyChoice(g,id,c);list.push({id,choice:c,shields:g.players[id].shields,boosts:g.players[id].boosts});}
      emitEv('choices',list);await act(io,{k:'chosen',list});}
    if(!g.finished&&R.alivePlayers(g).length===2&&!finaleSaid){finaleSaid=true;await act(io,{k:'finale'});}
  }
  return {winner:g.winner,positions,g};
}
let hostGame=null;
const targetIds=g=>R.alivePlayers(g).map(p=>p.id);
/* Zünden? Bei „Eigenes Ziel“ und beim Geisterfluch danach das Ziel antippen. Liefert Ziel (oder null) bzw. undefined = nicht gezündet */
async function askAct(id,ids,secs){const p=P(id),yes=await ask2(p.alive?'🔥 Zünden!':'👻 Verfluchen!',p.alive?'Aufheben':'Nein',secs);if(yes!=='a')return undefined;
  if(!(!p.alive||cfg.boostType==='ziel'))return null;
  prompt(`<b>${esc(p.name)}</b>: Welche Burg soll’s treffen?`,{secs:8});const t=await choose(ids.filter(x=>x!==id),8);return t==null?undefined:t;}

/* Am Tisch: alles reihum auf einem Handy */
const offlineIO={
  emit(){},
  async place(names){const pos=[];for(let i=0;i<names.length;i++){await present({k:'placeAsk',id:i,name:names[i].name});const g=await choosePlace(null);pos.push(g);hidePrompt();await present({k:'build',id:i,x:g.x,z:g.z});}return pos;},
  async acts(g){const acts={};for(const id of R.actors(g)){await present({k:'actAsk',id,secs:6});const t=await askAct(id,targetIds(g),6);if(t!==undefined)acts[id]=t;await wait(.2);}hidePrompt();return acts;},
  async choices(g,ids){const out={};for(const id of ids){await present({k:'chooseAsk',id,secs:8});const c=await ask2('🔥 Angriffs-Boost','🛡 Schild',8);out[id]=c==='a'?'boost':'schild';}hidePrompt();return out;},
  afterGame(){return guard(new Promise(res=>{$('bResNext').onclick=()=>{sfx.click();res('next');};$('bResMenu').onclick=()=>{sfx.click();res('menu');};if(AUTO&&Q.get('auto')==='loop')world.after(2,()=>res('next'));}));}
};

/* ---------- Online: Gastgeber ---------- */
let net=null,roster=[],isHost=false,players=[],inbox=null,myCid=clientId();
const myIndex=cids=>{const i=(cids||[]).indexOf(myCid);return i<0?null:i;};
function sendChoice(d){if(isHost)onFrom({cid:myCid,d});else net&&net.toHost(d);}
function onFrom({cid,d}){if(inbox)inbox(cid,d);}
const regionCorners=()=>[{x:-ONLINE_REGION.x,z:ONLINE_REGION.z0},{x:ONLINE_REGION.x,z:ONLINE_REGION.z0},{x:-ONLINE_REGION.x,z:ONLINE_REGION.z1},{x:ONLINE_REGION.x,z:ONLINE_REGION.z1}];
function placeLoop(){return choosePlace(ONLINE_REGION).then(g=>{sendChoice({t:'place',x:+g.x.toFixed(3),z:+g.z.toFixed(3)});prompt('Baumeister sind unterwegs…');});}
const hostIO={
  emit(s){if(net)net.toAll(s);},
  async place(names){const pos=names.map(()=>null);const idx=cid=>names.findIndex(n=>n.cid===cid);
    await act(this,{k:'placeOpen'});
    await guard(new Promise(res=>{let left=names.length;
      const put=async(i,x,z)=>{pos[i]={x,z};left--;await quiet(act(this,{k:'build',id:i,x,z}));if(left===0){inbox=null;res();}};
      inbox=(cid,d)=>{const i=idx(cid);if(i<0||d.t!=='place'||pos[i])return;const err=world.canPlace(d.x,d.z,0,0,ONLINE_REGION)||(pos.some(p=>p&&Math.hypot(p.x-d.x,p.z-d.z)<3.1)?'nah':'');
        if(err){if(cid===myCid)present({k:'placeErr',err});else net.to(cid,{k:'placeErr',err});return;}put(i,d.x,d.z);};
      // Wer nach 45 s noch nicht gebaut hat, bekommt einen Platz zugewiesen
      world.after(45,()=>{for(let i=0;i<names.length;i++)if(!pos[i]){for(let t=0;t<500;t++){const x=(Math.random()*2-1)*ONLINE_REGION.x,z=ONLINE_REGION.z0+Math.random()*(ONLINE_REGION.z1-ONLINE_REGION.z0);
        if(!pos.some(p=>p&&Math.hypot(p.x-x,p.z-z)<3.1)){put(i,x,z);break;}}}});}));
    return pos;},
  collect(kind,who,secs,valid){return guard(new Promise(res=>{const got={},need=new Set(who.filter(id=>onlineIds().has(id)));const fin=()=>{inbox=null;res(got);};if(!need.size)return fin();
    inbox=(cid,d)=>{const i=players.findIndex(n=>n.cid===cid);if(i<0||d.t!==kind||i in got||!who.includes(i))return;const v=valid(d,i);if(v===undefined)return;got[i]=v;need.delete(i);if(!need.size)fin();};
    world.after(secs+(kind==='act'?9:.6),fin);}));},
  async acts(g){const who=R.actors(g),secs=8;await act(this,{k:'actOpen',secs,ids:targetIds(g),who});
    const got=await this.collect('act',who,secs,(d,i)=>d.skip?'skip':d.to==null?(R.needsTarget(g,i)?undefined:null):targetIds(g).includes(d.to)&&d.to!==i?d.to:undefined);
    for(const k of Object.keys(got))if(got[k]==='skip')delete got[k];return got;},
  async choices(g,ids){const secs=8;await act(this,{k:'chooseOpen',secs,who:ids});return this.collect('choice',ids,secs,d=>['boost','schild'].includes(d.c)?d.c:undefined);},
  afterGame(){return guard(new Promise(res=>{$('bResNext').onclick=()=>{sfx.click();res('next');};$('bResMenu').onclick=()=>{sfx.click();res('menu');};}));}
};
const onlineIds=()=>{const on=new Set(roster.filter(m=>m.online).map(m=>m.cid));return new Set(players.map((p,i)=>on.has(p.cid)?i:-1).filter(i=>i>=0));};

/* Online: Gast – Schritte der Reihe nach abspielen */
let evQueue=[],evBusy=false;
function enqueue(s){evQueue.push(s);if(!evBusy)drain();}
async function drain(){evBusy=true;while(evQueue.length){const s=evQueue.shift();
    // Wer hinterherhinkt (z. B. Handy war gesperrt), überspringt Wartezeiten bis zum aktuellen Stand
    try{await present(s);}catch(e){if(e===ABORT){evQueue.length=0;break;}console.error(e);}}evBusy=false;}

/* Zustand für Nachzügler (Gast verbindet sich mitten im Spiel neu) */
function snapshot(){return {k:'sync',preset:world.presetKey,cids:players.map(p=>p.cid),seed:hostGame?.seed||'',players:view.players.map(p=>({...p})),finale:view.finale,cfg:{ghostCurse:cfg.ghostCurse}};}
function applySync(s){newRun();world.clearCastles();world.setTitle(false);world.setPreset(s.preset);resetLabels();hideScreens();hidePrompt();
  view={players:s.players,me:myIndex(s.cids),finale:s.finale};$('seed').textContent=s.seed?'Seed '+s.seed:'';
  for(const p of view.players)if(p.placed)world.restore(p.id,p.x,p.z,p.color,p.towers,p.alive,p.shields);
  world.fitCamera(view.players.filter(p=>p.placed).map(p=>({x:p.x,z:p.z})));mood(view.finale?'finale':'taverne');herald('Wieder dabei!',{dur:1.6});}

/* ---------- Online: Lobby und Raum ---------- */
function setNetState(t){$('netState').textContent=t||'';}
function openNet(code,hostKey){if(net)net.close(false);net=new Net(code,{name:myName(),hostKey});isHost=!!hostKey;
  net.on('hello',m=>{isHost=m.host;setNetState('');renderRoom();});
  net.on('roster',m=>{roster=m.members;renderRoom();});
  net.on('status',s=>setNetState(s==='online'?'':'⚠ Verbindung weg – verbinde neu…'));
  net.on('error',msg=>{$('roomErr').textContent=msg;$('onErr').textContent=msg;});
  net.on('closed',msg=>{net=null;goMenu();show('online');$('onErr').textContent=msg;});
  net.on('hostgone',()=>{if(!isHost)setNetState('⚠ Gastgeber getrennt – wartet…');});
  net.on('ev',m=>{if(isHost)return;if(m.d.k==='sync'){evQueue.length=0;applySync(m.d);return;}enqueue(m.d);});
  net.on('from',onFrom);
  net.on('join',m=>{if(isHost&&mode==='host'&&players.some(p=>p.cid===m.cid))net.to(m.cid,snapshot());setNetState('');});
  net.on('offline',()=>{});
  $('roomCode').textContent=code;const link=shareBase()+'?raum='+code;$('roomQr').innerHTML=qrSvg(link);$('roomQr').title=link;
  $('roomErr').textContent='';show('room');renderRoom();}
function renderRoom(){if(!net)return;$('members').innerHTML=roster.map(m=>`<div class="mem ${m.online?'':'off'}"><span class="dot"></span>${esc(m.name)}${m.host?' 👑':''}${m.cid===myCid?' (Ihr)':''}</div>`).join('')||'<i class="lead">Verbinde…</i>';
  $('bRoomStart').classList.toggle('hide',!isHost);$('roomSettings').classList.toggle('hide',!isHost);
  $('bRoomStart').disabled=roster.filter(m=>m.online).length<2;
  if(!isHost)$('roomErr').textContent=$('roomErr').textContent||'Warte auf den Gastgeber…';}
function myName(){return ($('myName').value||store.get('myName','')).trim().slice(0,16);}
async function refreshLobby(){if($('online').classList.contains('hide'))return;
  try{const rooms=await lobbyList();$('rooms').innerHTML=rooms.length?rooms.map(r=>`<div class="room" data-code="${esc(r.code)}"><b>${esc(r.code)}</b><span>${esc(r.host)}</span><span>${r.players}/8</span></div>`).join(''):'<i class="lead">Grad koa offener Raum. Macht’s an eigenen auf!</i>';
    $('rooms').querySelectorAll('.room').forEach(el=>el.onclick=()=>joinRoom(el.dataset.code));}
  catch{$('rooms').innerHTML='<i class="lead">Lobby ned erreichbar – seid’s online?</i>';}
  setTimeout(refreshLobby,4000);}
async function joinRoom(code){code=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const name=myName();$('onErr').textContent='';
  if(!name){$('onErr').textContent='Zuerst an Namen eingeben!';$('myName').focus();return;}store.set('myName',name);
  if(code.length!==4){$('onErr').textContent='Der Code hat vier Zeichen.';return;}
  try{const info=await roomInfo(code);if(!info.ok){$('onErr').textContent='Den Raum gibt’s ned.';return;}}catch{$('onErr').textContent='Keine Verbindung zum Server.';return;}
  mode='guest';openNet(code,null);}
async function hostRoom(){const name=myName();$('onErr').textContent='';if(!name){$('onErr').textContent='Zuerst an Namen eingeben!';$('myName').focus();return;}store.set('myName',name);
  try{$('bCreate').disabled=true;const r=await createRoom(name,$('pubRoom').checked);mode='host';openNet(r.code,r.hostKey);}
  catch(e){$('onErr').textContent='Raum konnte ned erstellt werden – seid’s online?';}finally{$('bCreate').disabled=false;}}
async function startOnline(){if(!isHost||!net)return;players=roster.filter(m=>m.online).map(m=>({name:m.name,cid:m.cid}));if(players.length<2)return;
  const dup=new Set();players.forEach(p=>{let n=p.name,k=2;while(dup.has(n.toLowerCase()))n=p.name+' '+(k++);dup.add(n.toLowerCase());p.name=n;});
  net.raw({t:'start'});mode='host';newRun();
  try{await runMatch(hostIO,players);hostIO.emit({k:'toRoom'});net.raw({t:'reopen'});backToRoom();}
  catch(e){if(e!==ABORT)console.error(e);}}
function backToRoom(){newRun();world.clearCastles();world.setTitle(true);startDemo();resetLabels();hidePrompt();mood('menu');$('seed').textContent='';$('pauseBtn').classList.add('hide');
  if(net){show('room');$('roomErr').textContent='';renderRoom();}else goMenu();}

/* ---------- Ergebnis und Ruhmeshalle ---------- */
function showResult(s){const host=mode!=='guest';
  $('resTitle').textContent=s.matchWinner!=null&&s.match>1?'Großkönig '+s.ranking.find(r=>r.id===s.matchWinner).name+'!':'Lang lebe König '+s.ranking[0].name+'!';
  $('resMatch').textContent=s.match>1?`Best of ${s.match} · Stand: `+s.ranking.slice().sort((a,b)=>a.id-b.id).map(r=>`${r.name} ${s.wins[r.id]}`).join(' · '):`${s.rounds} Runden`;
  $('resRank').innerHTML=s.ranking.map(r=>`<div class="rk ${r.place===1?'k':''}"><span class="pos">${r.place===1?'👑':r.place+'.'}</span><span class="sw" style="background:${r.color}">${r.crestIcon}</span><span class="nm">${esc(r.name)}</span>
    <span class="ex">${r.revenge?r.revenge+' 🔥 Rache':''}</span></div>`).join('');
  $('resExtra').textContent='Seed '+s.seed;
  $('bResNext').textContent=s.matchWinner!=null||s.match===1?'Nochmal!':'Nächste Partie';
  $('bResNext').classList.toggle('hide',!host);$('bResMenu').textContent=mode==='offline'?'Menü':host?'Zum Raum':'Verlassen';
  if(!host){$('bResMenu').onclick=()=>{if(net)net.close();net=null;goMenu();};$('resExtra').textContent='Der Gastgeber entscheidet, wie’s weitergeht…';}
  // Ruhmeshalle: jedes Gerät führt seine eigene
  const hall=store.get('hall',{});for(const r of s.ranking){const h=hall[r.name]||(hall[r.name]={kings:0,games:0,great:0});
    h.games++;if(r.place===1)h.kings++;h.revenge=(h.revenge||0)+(r.revenge||0);if(s.matchWinner===r.id&&s.match>1)h.great++;}
  store.set('hall',hall);
  setTimeout(()=>show('result'),400/SPEED);}
function renderHall(){const hall=Object.entries(store.get('hall',{})).sort((a,b)=>b[1].kings-a[1].kings||b[1].great-a[1].great||b[1].games-a[1].games);
  $('hallBody').innerHTML=hall.length?`<table class="hall"><tr><th>Name</th><th class="c">👑</th><th class="c">⚜</th><th class="c">Partien</th><th class="c">🔥</th></tr>
    ${hall.map(([n,h])=>`<tr><td>${esc(n)}</td><td class="c">${h.kings}</td><td class="c">${h.great}</td><td class="c">${h.games}</td><td class="c">${h.revenge||0}</td></tr>`).join('')}</table>
    <p class="lead" style="font-size:.9rem">👑 Krönungen · ⚜ Großkönig (Best-of) · 🔥 Rache-Treffer (Boost und Geisterfluch)</p>`:'<p class="lead center" style="text-align:center">Noch hat keiner a Kron’ getragen.</p>';}

/* ---------- Einstellungen ---------- */
function mountSettings(box){box.innerHTML='';box.appendChild($('settingsTpl').content.cloneNode(true));box.querySelectorAll('input[type=radio]').forEach(r=>r.name=box.id+'_'+r.name);
  box.querySelectorAll('.seg').forEach(seg=>{const k=seg.dataset.k;seg.querySelectorAll('input').forEach(inp=>{
    const bool=['camFx','ghostCurse','killcam'].includes(k);
    if(k==='attacks')inp.checked=cfg.attacks.includes(inp.value);else inp.checked=String(bool?(cfg[k]?1:0):cfg[k])===inp.value;
    inp.onchange=()=>{sfx.click();if(k==='attacks'){const on=[...seg.querySelectorAll('input:checked')].map(i=>i.value);if(!on.length){inp.checked=true;return;}cfg.attacks=on;}
      else if(bool)cfg[k]=inp.value==='1';else if(k==='match')cfg.match=+inp.value;else cfg[k]=inp.value;
      world.effects=cfg.camFx;store.set('settings',cfg);};});});}

/* ---------- Spieler-Eingabe (am Tisch) ---------- */
let names=store.get('names',['','','']);
function renderNames(){const L=$('plist');L.innerHTML='';names.forEach((n,i)=>{const r=document.createElement('div');r.className='pl';
  r.innerHTML=`<span class="n">${i+1}.</span><input maxlength="16" placeholder="Name" autocomplete="off" enterkeyhint="next"><button class="x" aria-label="entfernen">✕</button>`;
  const inp=r.querySelector('input');inp.value=n;inp.oninput=()=>{names[i]=inp.value;store.set('names',names);};
  inp.onkeydown=e=>{if(e.key==='Enter'){const nx=L.querySelectorAll('input')[i+1];if(nx)nx.focus();else inp.blur();}};
  r.querySelector('.x').onclick=()=>{if(names.length>2){names.splice(i,1);store.set('names',names);renderNames();}};r.querySelector('.x').style.visibility=names.length>2?'':'hidden';L.appendChild(r);});
  $('bAdd').disabled=names.length>=8;}
function validNames(){const list=names.map(n=>n.trim());if(list.some(n=>!n))return 'Jeder braucht an Namen!';
  const s=new Set(list.map(n=>n.toLowerCase()));if(s.size!==list.length)return 'Zwoa Leit’ mit gleichem Namen? Des geht ned.';return '';}
async function startOffline(list){mode='offline';newRun();initAudio();
  try{await runMatch(offlineIO,list.map(name=>({name})));goMenu();}catch(e){if(e!==ABORT)console.error(e);}}

/* ---------- Titelbild: ein paar Burgen im Hintergrund, ab und zu kracht’s ---------- */
let demoGen=0;
function startDemo(){const my=++demoGen;world.setPreset(['abend','nacht','tag'][Math.floor(Math.random()*3)]);
  const spots=[[-5,-2],[4.5,-3.5],[0,3.5],[-3,6],[6,3]],cols=['#d63a3a','#2f6fd6','#2fa84f','#e0b12a','#8e44c8'];
  spots.forEach((s,i)=>world.addCastle(100+i,s[0],s[1],cols[i]));world.life.populate();
  const tick=()=>{if(my!==demoGen)return;const ids=[...world.castles.keys()].filter(id=>!world.castle(id).fallen),id=ids[Math.floor(Math.random()*ids.length)];
    if(id!=null){const c=world.castle(id),attack=Math.random()<.5?world.catapult(id):world.keg(id);
      attack.then(()=>{if(my!==demoGen)return;world.hitTower(id,false);if(!c.towers.some(t=>t.up)){world.fallCastle(id);world.after(5,()=>{if(my===demoGen)world.revive(id),c.towers.forEach(t=>{t.up=true;});});}});}
    world.after(6+Math.random()*3,tick);};
  world.after(3,tick);}
function goMenu(){newRun();demoGen++;if(net&&mode!=='offline'){net.close();net=null;}mode='offline';paused=false;
  world.clearCastles();world.setTitle(true);resetLabels();hidePrompt();$('count').innerHTML='';$('seed').textContent='';setNetState('');$('pauseBtn').classList.add('hide');
  startDemo();mood('menu');show('menu');}

/* ---------- Knöpfe ---------- */
const on=(id,fn)=>$(id).addEventListener('click',e=>{sfx.click();fn(e);});
on('bOffline',()=>{renderNames();mountSettings($('settingsBox'));$('setupErr').textContent='';show('setup');});
on('bAdd',()=>{if(names.length<8){names.push('');store.set('names',names);renderNames();const ins=$('plist').querySelectorAll('input');ins[ins.length-1].focus();}});
on('bSetupBack',()=>show('menu'));
on('bStart',()=>{const err=validNames();$('setupErr').textContent=err;if(err){buzz(80);return;}startOffline(names.map(n=>n.trim()));});
on('bOnline',()=>{$('myName').value=store.get('myName','');$('onErr').textContent='';show('online');refreshLobby();});
on('bOnBack',()=>show('menu'));
on('bCreate',hostRoom);
on('bJoin',()=>joinRoom($('joinCode').value));
$('joinCode').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom($('joinCode').value);});
on('bLeave',()=>{if(net)net.close();net=null;goMenu();show('online');refreshLobby();});
on('bRoomStart',startOnline);
on('bHall',()=>{renderHall();show('hall');});
on('bHallBack',()=>show('menu'));
on('bHallClear',()=>{if(confirm('Die ganze Ruhmeshalle löschen?')){store.set('hall',{});renderHall();}});
let rulesBack='menu';
on('bRules',()=>{rulesBack='menu';show('rules');});
on('helpBtn',()=>{const vis=SCREENS.find(s=>!$(s).classList.contains('hide'));rulesBack=vis||null;if(mode==='offline'&&!vis&&!$('pauseBtn').classList.contains('hide'))setPaused(true,false);show('rules');});
on('bRulesOk',()=>{store.set('seenRules',true);if(rulesBack)show(rulesBack);else{hideScreens();if(paused)setPaused(false);}});
on('soundBtn',()=>setSound(!soundOn));
on('pauseBtn',()=>setPaused(true));
on('bResume',()=>setPaused(false));
on('bAbort',()=>{paused=false;if(audio)audio.ac.resume();goMenu();});
function setPaused(p,screen=true){paused=p;if(audio)p?audio.ac.suspend():audio.ac.resume();if(p){if(screen)show('pause');}else hideScreens();}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='offline'&&!$('pauseBtn').classList.contains('hide')&&!paused)setPaused(true);});
mountSettings($('roomSettings'));

/* ---------- Bildaufbau ---------- */
let last=performance.now(),acc=0,frames=0;
function frame(now){const real=Math.min(.25,(now-last)/1000);last=now;const dt=Math.min(.05,real)*SPEED;
  if(!paused)world.update(dt);world.render();updateLabels();
  if(promptTimer){const k=Math.max(0,1-(world.time-promptTimer.t0)/promptTimer.dur),left=Math.ceil(k*promptTimer.dur);$('timer').firstElementChild.style.transform=`scaleX(${k})`;
    if(left<=3&&left>0&&left!==lastTick){lastTick=left;sfx.tick();}}
  // Auflösung anpassen, wenn es ruckelt
  acc+=real;frames++;if(acc>.8&&!FIXQ){const ms=acc/frames*1000;if(ms>28&&world.q>.5){world.q=Math.max(.5,world.q*.85);world.resize();}else if(ms<13&&world.q<1){world.q=Math.min(1,world.q*1.08);world.resize();}acc=0;frames=0;}
  requestAnimationFrame(frame);}
addEventListener('resize',()=>world.resize());
requestAnimationFrame(frame);

/* ---------- Start ---------- */
if(/androidplatform\.net$/.test(location.hostname))$('apkLink').classList.add('hide');
window.__kf={world,R,get view(){return view;},get cfg(){return cfg;},present};
goMenu();$('fade').style.opacity=0;
if(AUTO){cfg={...DEFAULTS,...cfg};if(Q.get('attacks'))cfg.attacks=Q.get('attacks').split(',');for(const k of ['boostType','stack','tempo','cam'])if(Q.get(k))cfg[k]=Q.get(k);if(Q.has('noghost'))cfg.ghostCurse=false;if(Q.has('nokill'))cfg.killcam=false;if(Q.get('match'))cfg.match=+Q.get('match');if(Q.has('nofx'))cfg.camFx=false;
  startOffline((Q.get('names')||'Anna,Bert,Cleo,Dora').split(','));}
else if(Q.get('raum')){$('myName').value=store.get('myName','');$('joinCode').value=Q.get('raum').toUpperCase();show('online');refreshLobby();if(store.get('myName',''))joinRoom(Q.get('raum'));else $('myName').focus();}
else if(!store.get('seenRules',false)){rulesBack='menu';show('rules');}
