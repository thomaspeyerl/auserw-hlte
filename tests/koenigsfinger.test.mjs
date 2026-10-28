// Fairness- und Regeltests für Königsfinger: geprüft wird genau das Regelmodul, das auch das Spiel lädt.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../koenigsfinger/js/rules.js';
import {hops,rngOf,freshSeed} from '../koenigsfinger/js/fate.js';
import {uniformity,ALPHA} from './helpers.mjs';

// Burgen im Kreis (gleiche Abstände – kein Drache bevorzugt jemanden)
const ring=n=>Array.from({length:n},(_,i)=>({name:'S'+i,x:Math.cos(i/n*6.283)*6,z:Math.sin(i/n*6.283)*6}));
const game=(n,o={})=>R.createGame({players:ring(n),...o});
const rnd=a=>a[Math.floor(Math.random()*a.length)];
// Zufällige Spielentscheidungen: manche zünden, Getroffene wählen Boost oder Schild
function randomActs(g){const acts={};for(const id of R.actors(g))if(Math.random()<.6){const t=R.alivePlayers(g).filter(p=>p.id!==id);if(t.length)acts[id]=rnd(t).id;}return acts;}
function playOut(g,choose=true){while(!g.finished){const r=R.playRound(g,randomActs(g));if(choose)for(const c of r.choosers)R.applyChoice(g,c,rnd(['boost','schild']));}return g;}

test('Jede Burg startet mit 5 Türmen, ohne Schild und Boost',()=>{
  const g=game(4);for(const p of g.players){assert.equal(p.towers,5);assert.equal(p.shields,0);assert.equal(p.boosts,0);}
});

test('Ziel des ersten Einschlags ist gleichverteilt (Katapult)',()=>{
  for(const n of [2,3,6,8]){const c=Array(n).fill(0);
    for(let i=0;i<24000;i++){const g=game(n,{attacks:['katapult']});c[R.playRound(g).strikes[0].target]++;}
    const u=uniformity(c);assert.ok(u.p>ALPHA,`n=${n}: p=${u.p}`);}
});

test('Angriffsart ist gleichverteilt unter den gewählten',()=>{
  const c=[0,0,0,0];for(let i=0;i<20000;i++){const g=game(5);c[R.ATTACKS.indexOf(R.playRound(g).strikes[0].type)]++;}
  assert.ok(uniformity(c).p>ALPHA,JSON.stringify(c));
  for(let i=0;i<500;i++){const g=game(4,{attacks:['drache','fluch']});assert.ok(['drache','fluch'].includes(R.playRound(g).strikes[0].type));}
});

test('Gleicher Seed und gleiche Entscheidungen ergeben die gleiche Partie (nachprüfbar)',()=>{
  const seedHex=game(6).seed,run=()=>{const g=game(6,{seedHex});let k=0;
    while(!g.finished){const acts={};for(const id of R.actors(g))if((k++)%2)acts[id]=R.alivePlayers(g).find(p=>p.id!==id).id;
      const r=R.playRound(g,acts);r.choosers.forEach((c,i)=>R.applyChoice(g,c,i%2?'boost':'schild'));}
    return g.log.map(r=>r.strikes.map(s=>s.type+s.targets.join()+(s.chain??'')).join('|')).join('/')+g.winner;};
  assert.equal(run(),run());
});

test('Getroffene wählen: genau die Lebenden, die diese Runde Türme verloren haben',()=>{
  for(let i=0;i<3000;i++){const g=game(5);
    while(!g.finished){const before=g.players.map(p=>p.towers),r=R.playRound(g,randomActs(g));
      const lost=g.players.filter(p=>p.alive&&p.towers<before[p.id]).map(p=>p.id);
      assert.deepEqual(r.choosers,g.finished?[]:lost);for(const c of r.choosers)R.applyChoice(g,c,rnd(['boost','schild']));}}
});

test('Schild fängt genau einen Treffer ab und bleibt bis dahin; der Fluch durchbricht alle Schilde',()=>{
  let blocked=0,broke=0;
  for(let i=0;i<4000;i++){const g=game(5,{stack:'viele'});
    while(!g.finished){const sh=g.players.map(p=>p.shields),tw=g.players.map(p=>p.towers),r=R.playRound(g,randomActs(g));
      for(const st of r.strikes)for(const h of st.hits){
        if(st.type==='fluch'){assert.equal(h.blocked,false);if(sh[h.id]>0){assert.ok(h.broke);broke++;}sh[h.id]=0;}
        else if(sh[h.id]>0){assert.ok(h.blocked);assert.equal(h.dmg,0);sh[h.id]--;blocked++;}
        else assert.equal(h.blocked,false);
        tw[h.id]-=h.dmg;assert.equal(h.towers,tw[h.id]);assert.equal(h.shields,sh[h.id]);}
      for(const p of g.players)if(p.alive&&!r.stechen)assert.equal(p.shields,sh[p.id],'Schilde verfallen nicht von selbst');
      for(const c of r.choosers)R.applyChoice(g,c,rnd(['boost','schild']));}}
  assert.ok(blocked>500&&broke>50,`${blocked} geblockt, ${broke} durchbrochen`);
});

test('Stapeln: höchstens ein Buff / je einer / unbegrenzt',()=>{
  const g1=game(3,{stack:'eins'});R.applyChoice(g1,0,'schild');R.applyChoice(g1,0,'boost');assert.deepEqual([g1.players[0].shields,g1.players[0].boosts],[0,1]);
  const g2=game(3,{stack:'je'});R.applyChoice(g2,0,'schild');R.applyChoice(g2,0,'schild');R.applyChoice(g2,0,'boost');assert.deepEqual([g2.players[0].shields,g2.players[0].boosts],[1,1]);
  const g3=game(3,{stack:'viele'});for(let i=0;i<3;i++)R.applyChoice(g3,0,'schild');R.applyChoice(g3,0,'boost');assert.deepEqual([g3.players[0].shields,g3.players[0].boosts],[3,1]);
  assert.equal(R.applyChoice(g3,0,'krone'),false);
});

test('Boost „Extra-Einschlag“: trifft nie die eigene Burg, Ziel gleichverteilt unter den anderen',()=>{
  const c=Array(5).fill(0);
  for(let i=0;i<20000;i++){const g=game(5,{boostType:'extra',attacks:['katapult']});g.players[0].boosts=1;const r=R.playRound(g,{0:null});
    const b=r.strikes.filter(s=>s.src==='boost');assert.equal(b.length,1);assert.equal(b[0].from,0);assert.notEqual(b[0].target,0);c[b[0].target]++;
    assert.equal(g.players[0].boosts,0,'Boost verbraucht');}
  assert.equal(c[0],0);assert.ok(uniformity(c.slice(1)).p>ALPHA,JSON.stringify(c));
});

test('Boost „Eigenes Ziel“ trifft die gewählte Burg, ohne Boost passiert nichts',()=>{
  for(let i=0;i<3000;i++){const g=game(6,{boostType:'ziel'});g.players[2].boosts=1;const t=[0,1,3,4,5][i%5];const r=R.playRound(g,{2:t,4:0});
    const b=r.strikes.filter(s=>s.src==='boost');assert.equal(b.length,1,'Spieler 4 hat keinen Boost');
    if(g.players[t].towers>0||b[0].target===t)assert.equal(b[0].target,t);}
});

test('Boost „Doppelschaden“: Treffer auf fremde Burgen kosten 2 Türme, die eigene nur 1',()=>{
  let own=0,other=0;
  for(let i=0;i<5000;i++){const g=game(4,{boostType:'doppel',attacks:['katapult']});g.players[1].boosts=1;const r=R.playRound(g,{1:null});
    assert.equal(r.strikes.filter(s=>s.src==='boost').length,0);
    for(const h of r.strikes.flatMap(s=>s.hits)){assert.equal(h.dmg,h.id===1?1:2);if(h.id===1)own++;else other++;}}
  assert.ok(own>500&&other>2000);
});

test('Geisterfluch: nur Gefallene, nur einmal pro Partie, trifft die gewählte Burg und durchbricht Schilde',()=>{
  for(let i=0;i<2000;i++){const g=game(4,{ghostCurse:true});const ghost=g.players[3];ghost.alive=false;ghost.towers=0;g.players[1].shields=2;
    assert.ok(R.actors(g).includes(3));const r=R.playRound(g,{3:1,0:2});
    const c=r.strikes.filter(s=>s.src==='geist');assert.equal(c.length,1);assert.equal(c[0].type,'fluch');
    if(c[0].target===1)assert.ok(c[0].hits[0].broke||g.players[1].shields===0);
    assert.ok(ghost.curseUsed);assert.ok(!R.actors(g).includes(3));
    if(!g.finished){const r2=R.playRound(g,{3:1});assert.equal(r2.strikes.filter(s=>s.src==='geist').length,0,'nur einmal');}}
  const off=game(3,{ghostCurse:false});off.players[2].alive=false;assert.ok(!R.actors(off).includes(2));
  assert.equal(R.playRound(off,{2:0}).strikes.filter(s=>s.src==='geist').length,0);
});

test('Drache trifft genau die Burgen nahe seiner Flugbahn',()=>{
  for(let i=0;i<3000;i++){const ps=Array.from({length:6},(_,k)=>({name:'S'+k,x:(Math.random()*2-1)*7,z:(Math.random()*2-1)*6}));
    const g=R.createGame({players:ps,attacks:['drache']}),s=R.playRound(g).strikes[0],t=g.players[s.target],dx=Math.cos(s.dir),dz=Math.sin(s.dir);
    for(const p of g.players){const d=Math.abs((p.x-t.x)*dz-(p.z-t.z)*dx);assert.equal(s.targets.includes(p.id),p.id===s.target||d<=R.DRAGON_WIDTH);}}
});

test('Pulverfass springt in etwa 25 % der Fälle auf eine andere Burg über',()=>{
  let n=0,ch=0;for(let i=0;i<20000;i++){const g=game(5,{attacks:['pulver']});const s=R.playRound(g).strikes[0];n++;if(s.chain!=null){ch++;assert.notEqual(s.chain,s.target);}}
  const p=ch/n,se=Math.sqrt(.25*.75/n);assert.ok(Math.abs(p-.25)<6*se,`Quote ${p}`);
});

test('Fluch trifft immer eine Burg mit den meisten Türmen',()=>{
  for(let i=0;i<3000;i++){const g=game(5,{attacks:['fluch','katapult']});
    while(!g.finished){const tw=g.players.map(p=>p.alive?p.towers:0),r=R.playRound(g,{});
      for(const st of r.strikes){if(st.src==='zufall'&&st.type==='fluch')assert.equal(tw[st.target],Math.max(...tw));for(const h of st.hits)tw[h.id]-=h.dmg;}
      for(const c of r.choosers)R.applyChoice(g,c,'schild');}}
});

test('Ohne Drachen und ohne Entscheidungen hat jede Burg die gleiche Chance, König zu werden',()=>{
  const n=5,c=Array(n).fill(0);for(let i=0;i<20000;i++){const g=game(n,{attacks:['katapult','pulver','fluch'],ghostCurse:false});
    while(!g.finished){const r=R.playRound(g,{});for(const id of r.choosers)R.applyChoice(g,id,'schild');}c[g.winner]++;}
  assert.ok(uniformity(c).p>ALPHA,JSON.stringify(c));
});

test('Jede Partie endet mit genau einem König, Plätze passen, Stechen belebt die Gefallenen',()=>{
  let stechen=0;
  for(let i=0;i<6000;i++){const n=2+i%7,g=game(n,{boostType:R.BOOSTS[i%3],stack:R.STACKS[i%3],tempo:['kurz','mittel','lang'][i%3]});let rounds=0;
    while(!g.finished){const r=R.playRound(g,randomActs(g));rounds++;assert.ok(rounds<300);
      if(r.stechen){stechen++;for(const s of r.strikes)for(const h of s.hits)if(h.fell)assert.equal(g.players[h.id].towers,1);}
      for(const c of r.choosers)R.applyChoice(g,c,rnd(['boost','schild']));}
    const alive=g.players.filter(p=>p.alive);assert.equal(alive.length,1);assert.equal(alive[0].id,g.winner);assert.equal(alive[0].place,1);
    for(const p of g.players)if(p.id!==g.winner){assert.ok(p.place>=2&&p.place<=n);assert.equal(p.towers,0);}}
  assert.ok(stechen>0,'Stechen kommt vor');assert.ok(stechen<6000*.08,'Stechen bleibt selten: '+stechen);
});

test('Tempo: kurz eskaliert schneller als lang, nie mehr als Lebende − 1',()=>{
  const seq=t=>{const g=game(8,{tempo:t});return Array.from({length:10},(_,r)=>{g.round=r+1;return R.strikesFor(g);});};
  assert.deepEqual(seq('kurz').slice(0,6),[2,3,4,5,6,7]);
  assert.deepEqual(seq('mittel').slice(0,6),[2,2,3,3,4,4]);
  assert.deepEqual(seq('lang').slice(0,6),[2,2,2,2,3,3]);
  const g=game(8,{tempo:'kurz'});g.players.forEach((p,i)=>{if(i>1)p.alive=false;});g.round=20;assert.equal(R.strikesFor(g),1);
  const len=t=>{let s=0;for(let i=0;i<1500;i++)s+=playOut(game(6,{tempo:t})).round;return s/1500;};
  assert.ok(len('kurz')<len('lang'));
});

test('Fadenkreuz endet immer beim Ziel, Startpunkt gleichverteilt',()=>{
  const rng=rngOf(freshSeed());
  for(let i=0;i<20000;i++){const m=1+i%8,t=Math.floor(rng()*m),s=Math.floor(rng()*m),h=hops(m,s,t,rng);assert.equal(h.path[h.path.length-1],t);
    for(let j=1;j<h.path.length;j++)if(m>1)assert.notEqual(h.path[j],h.path[j-1]);}
  const c=Array(6).fill(0);for(let i=0;i<12000;i++){const gg=game(6,{attacks:['katapult']});c[R.playRound(gg).strikes[0].path[0]]++;}
  assert.ok(uniformity(c).p>ALPHA);
});
