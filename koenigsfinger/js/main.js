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
const DEFAULTS={attacks:[...R.ATTACKS],betMode:'round',match:1,camFx:true};

/* ---------- 3D-Welt ---------- */
let world;
try{world=new World($('gl'));}catch(e){console.warn(e);$('nogl').classList.remove('hide');$('menu').classList.add('hide');$('fade').style.opacity=0;throw e;}
let cfg={...DEFAULTS,...store.get('settings',{})};
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

/* ---------- Abbrechbare Abläufe ---------- */
let ctl=new AbortController();
function newRun(){ctl.abort();ctl=new AbortController();tapHandler=null;chooser=null;promptTimer=null;return ctl.signal;}
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

/* ---------- Spielansicht: Spieler, Namensschilder, Wett-Marken ---------- */
let view={players:[],bets:{},kingBets:{},me:null,finale:false};
const labels=new Map();
function resetLabels(){labels.clear();$('labels').innerHTML='';}
function label(p){let el=labels.get(p.id);if(!el){el=document.createElement('div');el.className='lab';$('labels').appendChild(el);labels.set(p.id,el);el._k='';}
  const key=[p.name,p.color,p.crestIcon,p.towers,p.alive,p.ghostPts,view.me===p.id,JSON.stringify(betsOn(p.id))].join('|');if(key===el._k)return el;el._k=key;
  el.classList.toggle('dead',!p.alive);el.classList.toggle('me',view.me===p.id);
  const tw=[0,1,2].map(i=>`<span class="${i<p.towers?'':'d'}">♜</span>`).join('');
  el.innerHTML=`<div class="bets">${betsOn(p.id).map(b=>`<span class="tok" style="background:${b.color}">${b.icon}</span>`).join('')}</div>
    <div class="nm" style="background:${p.color}"><span class="ic">${p.alive?p.crestIcon||'🏰':'👻'}</span>${esc(p.name)}${p.ghostPts?` · ${p.ghostPts}👻`:''}</div>${p.alive?`<div class="tw">${tw}</div>`:''}`;return el;}
function betsOn(id){const out=[];for(const [from,to] of Object.entries(view.bets))if(to===id){const p=view.players[from];if(p)out.push({color:p.color,icon:p.alive?p.crestIcon||'•':'👻'});}
  for(const [from,to] of Object.entries(view.kingBets))if(to===id){const p=view.players[from];if(p)out.push({color:p.color,icon:'👑'});}return out;}
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
    view={players:s.names.map((name,id)=>({id,name,color:NEUTRAL,crestIcon:'',crest:'',towers:R.TOWERS,alive:true,shield:false,ghostPts:0,x:0,z:0,placed:false})),bets:{},kingBets:{},me:mode==='offline'?null:myIndex(s.cids),finale:false};
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
    world.fitCamera(view.players.map(p=>({x:p.x,z:p.z})));herald(say('lots'),{dur:2.6});$('seed').textContent='Seed '+s.seed;await wait(1.8);break;}
  case 'kingAsk':prompt(`<b>${esc(s.name)}</b>: Wer wird König?`,{secs:s.secs});herald(say('kingBet',{name:s.name}),{dur:2});break;
  case 'kingBet':view.kingBets[s.from]=s.to;sfx.bet();break;
  case 'kingOpen':{const me=view.me;prompt(me!=null?'Wer wird König? Tippt <b>g’heim</b> eine Burg an!':'Die anderen tippen…',{secs:s.secs});herald('Wer wird König? Jeder tippt g’heim!',{dur:2.4});
    if(me!=null)quiet(choose(s.ids,s.secs).then(to=>{if(to!=null){sendChoice({t:'king',to});prompt('Euer Tipp is abgegeben. Psst!');sfx.bet();}}));break;}
  case 'kingbets':hidePrompt();if(chooser)chooser.fin(null);view.kingBets=s.bets;sfx.coin();herald('Die Königswetten stehen!',{dur:2});await wait(1.4);break;
  case 'round':{world.setReticle(null);mood(view.finale?'finale':'taverne');herald(say(s.strikes===1?'round1':'round',{n:s.n,k:s.strikes}),{fanfare:true,dur:2.6});sfx.drum();emitEv('roundStart',s);await wait(2.2);break;}
  case 'betAsk':{const p=P(s.id);prompt(`<b>${esc(p.name)}</b>${p.alive?'':' 👻'}: Wo schlagt’s ein?`,{secs:s.secs});herald(say(p.alive?'bet':'ghostBet',{name:p.name}),{dur:2});break;}
  case 'bet':if(s.to==null)herald(say('noBet',{name:P(s.from).name}),{dur:1.4});else{view.bets[s.from]=s.to;sfx.bet();}break;
  case 'betOpen':{const me=view.me,ok=me!=null&&s.who.includes(me);
    prompt(ok?(P(me).alive?'Wo schlagt’s ein? Tippt <b>g’heim</b> eine Burg an!':'👻 Geistertipp: wo schlagt’s ein?'):'Die anderen wetten…',{secs:s.secs});herald(say('secretBet',{s:s.secs}),{dur:2.4});
    if(ok)quiet(choose(s.ids,s.secs).then(to=>{if(to!=null){sendChoice({t:'bet',to});prompt('Euer Tipp is abgegeben. Psst!');sfx.bet();}}));break;}
  case 'bets':hidePrompt();if(chooser)chooser.fin(null);view.bets=s.bets;if(Object.keys(s.bets).length)sfx.coin();await wait(1);break;
  case 'countdown':{hidePrompt();mood('schlacht',view.finale?.9:.4);for(const c of ['3','2','1']){showCount(c);sfx.countdown();buzz(40);await wait(.8);}
    showCount(say('countdown'),true);sfx.countdown(0,true);buzz([60,40,120]);await wait(.8);$('count').innerHTML='';break;}
  case 'strike':await presentStrike(s.st);break;
  case 'eval':{world.setReticle(null);const r=s.res;
    for(const p of view.players){const on=r.shieldsNext.includes(p.id);if(p.shield!==on){p.shield=on;world.setShield(p.id,on);}}
    if(r.shieldsNext.length)sfx.shieldUp();s.ghostPts.forEach((g,i)=>{if(P(i))P(i).ghostPts=g;});
    const alive=r.correct.filter(id=>r.shieldsNext.includes(id)),ghosts=r.correct.filter(id=>!P(id).alive);
    if(alive.length)herald(say(alive.length>1?'correctN':'correct',{names:joinNames(alive.map(id=>P(id).name))}),{dur:2.6});
    else if(ghosts.length)herald(say('ghostPts',{names:joinNames(ghosts.map(id=>P(id).name))}),{dur:2.6});
    else if(Object.keys(view.bets).length)herald(say('nobody'),{dur:2});
    if(ghosts.length&&alive.length)setTimeout(()=>herald(say('ghostPts',{names:joinNames(ghosts.map(id=>P(id).name))}),{dur:2.4}),2600/SPEED);
    await wait(alive.length&&ghosts.length?2.6:1.6);view.bets={};await wait(.6);break;}
  case 'stechen':{herald(say('stechen'),{fanfare:true,dur:3.4});sfx.drum();await wait(1);for(const id of s.ids){world.revive(id);const p=P(id);p.towers=1;p.alive=true;sfx.shieldUp();await wait(.3);}await wait(1.6);break;}
  case 'finale':view.finale=true;mood('finale');herald(say('finale'),{dur:3});sfx.heartbeat();await wait(.8);sfx.heartbeat();await wait(1.6);break;
  case 'king':{hidePrompt();world.setReticle(null);const p=P(s.id);mood('koenig');world.coronation(s.id);sfx.fanfare();sfx.bells(at(1));sfx.crowd(at(1.6),3.5);buzz([100,60,100,60,400]);
    herald(say('king',{name:p.name}),{dur:4.5});await wait(4.6);
    if(s.kingmakers.length){herald(say('kingmaker',{names:joinNames(s.kingmakers.map(id=>P(id).name))}),{dur:2.6});await wait(2.4);}
    if(s.matchWinner!=null){herald(say('matchKing',{name:P(s.matchWinner).name}),{fanfare:true,dur:3});await wait(2.6);}
    break;}
  case 'result':showResult(s);break;
  case 'sync':applySync(s);break;
  case 'toRoom':backToRoom();break;
  case 'menu':goMenu();break;
  }
}

/* Ein Einschlag: Fadenkreuz springt (erst wild, dann im Kreis langsamer), dann fliegt der Angreifer sichtbar ein */
async function presentStrike(st){
  const col=RET_COL[st.type];herald(say(st.type),{dur:2.4});mood('schlacht',view.finale?1:.7);
  if(st.type==='drache')sfx.roar();if(st.type==='fluch')sfx.ghost();
  const n=st.path.length,tail=n-st.chaos;
  for(let i=0;i<n;i++){world.setReticle(st.path[i],col);const last=i===n-1;sfx.tick(0,last);if(i%2===0)buzz(8);
    const k=i<st.chaos?0:(i-st.chaos+1)/Math.max(1,tail);await wait(last?.55:i<st.chaos?.1+Math.random()*.04:.13+.36*k*k);}
  emitEv('strike',{st,reticle:st.path[n-1]});buzz(BUZZ[st.type]);
  const hitOf=id=>st.hits.find(h=>h.id===id);const pend=[];
  if(st.type==='katapult'){sfx.creak();sfx.whoosh(at(.45),1.35/SPEED);await guard(world.catapult(st.target));world.setReticle(null);sfx.impact();await applyHit(st,hitOf(st.target));}
  else if(st.type==='pulver'){sfx.whoosh(0,.9/SPEED);sfx.stone(at(.9),.6);sfx.fuse(at(.9),1.1/SPEED);await guard(world.keg(st.target));world.setReticle(null);sfx.explosion();
    await applyHit(st,hitOf(st.target));
    if(st.chain!=null){herald(say('chain'),{dur:2});sfx.whoosh(0,1/SPEED);await guard(world.chain(st.target,st.chain));sfx.explosion(0,.8);await applyHit(st,hitOf(st.chain));}}
  else if(st.type==='drache'){sfx.wings(0,4.2/SPEED);world.setReticle(null);
    await guard(world.dragon(st.target,st.dir,st.targets,id=>{sfx.fire(0,.9);sfx.roar(at(.1),.8);pend.push(quiet(applyHit(st,hitOf(id))));}));await guard(Promise.all(pend));}
  else if(st.type==='fluch'){sfx.curse();await guard(world.curse(st.target));world.setReticle(null);await applyHit(st,hitOf(st.target));}
  await wait(.9);}
async function applyHit(st,h){if(!h)return;const p=P(h.id);
  if(st.type==='fluch'&&p.shield){p.shield=false;world.setShield(h.id,false);herald(say('shieldBroken',{name:p.name}),{dur:2});sfx.shield();await wait(.4);}
  if(h.blocked){world.hitTower(h.id,true);sfx.shield();buzz(BUZZ.shield);herald(say('blocked',{name:p.name}),{dur:2.2});return;}
  world.hitTower(h.id,false,st.type);p.towers=h.towers;sfx.scream(at(.08),1+Math.random()*.3);sfx.gore(at(.12));
  if(st.type!=='pulver')sfx.impact(0,.8);
  if(h.fell){await wait(.75);world.fallCastle(h.id);p.alive=false;sfx.crumble();sfx.explosion(0,.7);[0,.25,.5].forEach(d=>sfx.scream(at(d),.85+Math.random()*.5));sfx.gore(at(.3),1.6);
    sfx.bell(at(1.1),45,.4);buzz(BUZZ.fall);herald(say('fall',{name:p.name}),{dur:3});await wait(1.6);sfx.ghost();}
  else herald(say(h.towers===1?'lastTower':'hit',{name:p.name,t:h.towers}),{dur:2.2});}

/* ---------- Spielablauf (am Tisch und als Online-Gastgeber) ---------- */
let mode='offline',paused=false;
const act=(io,s)=>{io.emit(s);return present(s);};
const randPreset=()=>{const k=Object.keys(PRESETS);return k[Math.floor(Math.random()*k.length)];};

async function runMatch(io,names){
  const wins=names.map(()=>0);let positions=null,gameNo=0;
  for(;;){gameNo++;
    const r=await runGame(io,names,positions,gameNo);positions=r.positions;wins[r.winner]++;
    const need=Math.ceil((+cfg.match||1)/2),matchWinner=wins[r.winner]>=need?r.winner:null;
    const g=r.g;await act(io,{k:'king',id:r.winner,kingmakers:R.kingmakers(g),matchWinner:(+cfg.match||1)>1?matchWinner:null});
    const ranking=g.players.map(p=>({id:p.id,name:p.name,color:p.color,crestIcon:p.crestIcon,crest:p.crest,place:p.place,ghostPts:p.ghostPts,kingmaker:R.kingmakers(g).includes(p.id)})).sort((a,b)=>a.place-b.place||b.ghostPts-a.ghostPts);
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
  const g=R.createGame({players:names.map((n,i)=>({name:n.name,x:positions[i].x,z:positions[i].z})),attacks:cfg.attacks,betMode:cfg.betMode});
  hostGame=g;
  await act(io,{k:'paint',seed:g.seed,players:g.players.map(p=>({id:p.id,color:p.color,crest:p.crest,crestIcon:p.crestIcon}))});
  if(cfg.betMode==='start'){const kb=await io.kingBets(g);R.setKingBets(g,kb);await act(io,{k:'kingbets',bets:kb});}
  let finaleSaid=false;
  while(!g.finished){
    const n=R.strikesFor({...g,round:g.round+1});
    await act(io,{k:'round',n:g.round+1,strikes:n});
    let bets={};if(cfg.betMode==='round'){bets=await io.bets(g);await act(io,{k:'bets',bets});}
    await act(io,{k:'countdown'});
    const res=R.playRound(g,bets);emitEv('round',res);
    for(const st of res.strikes)await act(io,{k:'strike',st});
    await act(io,{k:'eval',res:{correct:res.correct,shieldsNext:res.shieldsNext},ghostPts:g.players.map(p=>p.ghostPts)});
    if(res.stechen){const ids=[...new Set(res.strikes.flatMap(s=>s.hits.filter(h=>h.fell).map(h=>h.id)))];await act(io,{k:'stechen',ids});}
    if(!g.finished&&R.alivePlayers(g).length===2&&!finaleSaid){finaleSaid=true;await act(io,{k:'finale'});}
  }
  return {winner:g.winner,positions,g};
}
let hostGame=null;
const betOrder=g=>[...g.players.filter(p=>p.alive),...g.players.filter(p=>!p.alive)];
const targetIds=g=>R.alivePlayers(g).map(p=>p.id);

/* Am Tisch: alles reihum auf einem Handy */
const offlineIO={
  emit(){},
  async place(names){const pos=[];for(let i=0;i<names.length;i++){await present({k:'placeAsk',id:i,name:names[i].name});const g=await choosePlace(null);pos.push(g);hidePrompt();await present({k:'build',id:i,x:g.x,z:g.z});}return pos;},
  async bets(g){const bets={};for(const p of betOrder(g)){await present({k:'betAsk',id:p.id,secs:5});const to=await choose(targetIds(g),5);if(to!=null)bets[p.id]=to;await present({k:'bet',from:p.id,to});await wait(.35);}hidePrompt();return bets;},
  async kingBets(g){const bets={};for(const p of g.players){await present({k:'kingAsk',name:p.name,secs:6});const to=await choose(targetIds(g),6);if(to!=null){bets[p.id]=to;await present({k:'kingBet',from:p.id,to});}await wait(.3);}hidePrompt();return bets;},
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
  collect(kind,g,who,secs){return guard(new Promise(res=>{const got={},need=new Set(who.filter(id=>onlineIds().has(id)));const fin=()=>{inbox=null;res(got);};
    inbox=(cid,d)=>{const i=players.findIndex(n=>n.cid===cid);if(i<0||d.t!==kind||got[i]!=null||!who.includes(i)||!targetIds(g).includes(d.to))return;got[i]=d.to;need.delete(i);if(!need.size)fin();};
    world.after(secs+.6,fin);}));},
  async bets(g){const who=betOrder(g).map(p=>p.id),secs=10;await act(this,{k:'betOpen',secs,ids:targetIds(g),who});return this.collect('bet',g,who,secs);},
  async kingBets(g){const who=g.players.map(p=>p.id),secs=10;await act(this,{k:'kingOpen',secs,ids:targetIds(g)});return this.collect('king',g,who,secs);},
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
function snapshot(){return {k:'sync',preset:world.presetKey,cids:players.map(p=>p.cid),seed:hostGame?.seed||'',players:view.players.map(p=>({...p})),finale:view.finale};}
function applySync(s){newRun();world.clearCastles();world.setTitle(false);world.setPreset(s.preset);resetLabels();hideScreens();hidePrompt();
  view={players:s.players,bets:{},kingBets:{},me:myIndex(s.cids),finale:s.finale};$('seed').textContent=s.seed?'Seed '+s.seed:'';
  for(const p of view.players)if(p.placed)world.restore(p.id,p.x,p.z,p.color,p.towers,p.alive,p.shield);
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
    <span class="ex">${r.ghostPts?r.ghostPts+' 👻':''}${r.kingmaker?' 🎯 Königsmacher':''}</span></div>`).join('');
  $('resExtra').textContent='Seed '+s.seed;
  $('bResNext').textContent=s.matchWinner!=null||s.match===1?'Nochmal!':'Nächste Partie';
  $('bResNext').classList.toggle('hide',!host);$('bResMenu').textContent=mode==='offline'?'Menü':host?'Zum Raum':'Verlassen';
  if(!host){$('bResMenu').onclick=()=>{if(net)net.close();net=null;goMenu();};$('resExtra').textContent='Der Gastgeber entscheidet, wie’s weitergeht…';}
  // Ruhmeshalle: jedes Gerät führt seine eigene
  const hall=store.get('hall',{});for(const r of s.ranking){const h=hall[r.name]||(hall[r.name]={kings:0,games:0,great:0,ghost:0,maker:0});
    h.games++;if(r.place===1)h.kings++;h.ghost+=r.ghostPts;if(r.kingmaker)h.maker++;if(s.matchWinner===r.id&&s.match>1)h.great++;}
  store.set('hall',hall);
  setTimeout(()=>show('result'),400/SPEED);}
function renderHall(){const hall=Object.entries(store.get('hall',{})).sort((a,b)=>b[1].kings-a[1].kings||b[1].great-a[1].great||b[1].games-a[1].games);
  $('hallBody').innerHTML=hall.length?`<table class="hall"><tr><th>Name</th><th class="c">👑</th><th class="c">⚜</th><th class="c">Partien</th><th class="c">👻</th><th class="c">🎯</th></tr>
    ${hall.map(([n,h])=>`<tr><td>${esc(n)}</td><td class="c">${h.kings}</td><td class="c">${h.great}</td><td class="c">${h.games}</td><td class="c">${h.ghost}</td><td class="c">${h.maker}</td></tr>`).join('')}</table>
    <p class="lead" style="font-size:.9rem">👑 Krönungen · ⚜ Großkönig (Best-of) · 👻 Geisterpunkte · 🎯 Königsmacher</p>`:'<p class="lead center" style="text-align:center">Noch hat keiner a Kron’ getragen.</p>';}

/* ---------- Einstellungen ---------- */
function mountSettings(box){box.innerHTML='';box.appendChild($('settingsTpl').content.cloneNode(true));box.querySelectorAll('input[type=radio]').forEach(r=>r.name=box.id+'_'+r.name);
  box.querySelectorAll('.seg').forEach(seg=>{const k=seg.dataset.k;seg.querySelectorAll('input').forEach(inp=>{
    if(k==='attacks')inp.checked=cfg.attacks.includes(inp.value);else inp.checked=String(k==='camFx'?(cfg.camFx?1:0):cfg[k])===inp.value;
    inp.onchange=()=>{sfx.click();if(k==='attacks'){const on=[...seg.querySelectorAll('input:checked')].map(i=>i.value);if(!on.length){inp.checked=true;return;}cfg.attacks=on;}
      else if(k==='camFx')cfg.camFx=inp.value==='1';else if(k==='match')cfg.match=+inp.value;else cfg[k]=inp.value;
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
  spots.forEach((s,i)=>world.addCastle(100+i,s[0],s[1],cols[i]));
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
if(AUTO){cfg={...DEFAULTS,...cfg};if(Q.get('attacks'))cfg.attacks=Q.get('attacks').split(',');if(Q.get('bet'))cfg.betMode=Q.get('bet');if(Q.get('match'))cfg.match=+Q.get('match');if(Q.has('nofx'))cfg.camFx=false;
  startOffline((Q.get('names')||'Anna,Bert,Cleo,Dora').split(','));}
else if(Q.get('raum')){$('myName').value=store.get('myName','');$('joinCode').value=Q.get('raum').toUpperCase();show('online');refreshLobby();if(store.get('myName',''))joinRoom(Q.get('raum'));else $('myName').focus();}
else if(!store.get('seenRules',false)){rulesBack='menu';show('rules');}
