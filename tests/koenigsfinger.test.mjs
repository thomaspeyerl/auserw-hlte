// Fairness- und Regeltests für Königsfinger: geprüft wird genau das Regelmodul, das auch das Spiel lädt.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../koenigsfinger/js/rules.js';
import {hops,rngOf,freshSeed} from '../koenigsfinger/js/fate.js';
import {uniformity,ALPHA,chiP} from './helpers.mjs';

// Burgen im Kreis (gleiche Abstände – kein Drache bevorzugt jemanden) oder zufällig verstreut
const ring=n=>Array.from({length:n},(_,i)=>({name:'S'+i,x:Math.cos(i/n*6.283)*6,z:Math.sin(i/n*6.283)*6}));
const game=(n,o={})=>R.createGame({players:ring(n),...o});
const randomBets=g=>Object.fromEntries(g.players.map(p=>[p.id,R.alivePlayers(g)[Math.floor(Math.random()*R.alivePlayers(g).length)].id]));

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

test('Wetten beeinflussen die Ziele nicht (gleicher Seed, andere Tipps → gleicher Verlauf)',()=>{
  for(let i=0;i<300;i++){const seedHex=game(5).seed;const a=game(5,{seedHex}),b=game(5,{seedHex});
    for(let r=0;r<6&&!a.finished;r++){const ra=R.playRound(a,randomBets(a)),rb=R.playRound(b,randomBets(b));
      assert.deepEqual(ra.strikes.map(s=>[s.type,s.targets]),rb.strikes.map(s=>[s.type,s.targets]));
      // Schilde können durch unterschiedliche Tipps unterschiedlich sein – danach dürfen die Verläufe abweichen
      if(JSON.stringify(ra.shieldsNext)!==JSON.stringify(rb.shieldsNext))break;}}
});

test('Gleicher Seed ergibt die gleiche Partie (nachprüfbar)',()=>{
  const seedHex=game(6).seed,run=()=>{const g=game(6,{seedHex});while(!g.finished)R.playRound(g,{});return g.log.map(r=>r.strikes.map(s=>s.type+s.targets.join()+(s.chain??'')).join('|')).join('/')+g.winner;};
  assert.equal(run(),run());
});

test('Fluch trifft immer eine Burg mit den meisten Türmen und durchbricht Schilde',()=>{
  let broke=0;
  for(let i=0;i<3000;i++){const g=game(5);
    while(!g.finished){const before=g.players.map(p=>({t:p.towers,s:p.shield,a:p.alive}));const res=R.playRound(g,randomBets(g));
      // Türme vor jedem einzelnen Einschlag nachrechnen
      const towers=before.map(b=>b.a?b.t:0),shield=before.map(b=>b.a&&b.s);
      for(const st of res.strikes){
        if(st.type==='fluch'){const max=Math.max(...towers);assert.equal(towers[st.target],max,'Fluch auf stärkste Burg');
          assert.equal(st.hits[0].blocked,false);if(shield[st.target])broke++;shield[st.target]=false;}
        for(const h of st.hits){assert.equal(h.blocked,shield[h.id]&&st.type!=='fluch');if(!h.blocked)towers[h.id]--;assert.equal(towers[h.id],h.towers);}}}}
  assert.ok(broke>50,'Fluch hat Schilde durchbrochen: '+broke);
});

test('Schilde: nur für richtige Tipps, nur für die nächste Runde, halten alles außer Fluch',()=>{
  let blocked=0;
  for(let i=0;i<3000;i++){const g=game(4,{attacks:['katapult','pulver']});
    while(!g.finished){const sh=new Set(g.players.filter(p=>p.alive&&p.shield).map(p=>p.id)),bets=randomBets(g),res=R.playRound(g,bets);
      const landed=new Set(res.strikes.flatMap(s=>s.targets));
      for(const st of res.strikes)for(const h of st.hits){assert.equal(h.blocked,sh.has(h.id));if(h.blocked)blocked++;}
      for(const id of res.shieldsNext){assert.ok(landed.has(bets[id]),'Schild nur bei richtigem Tipp');assert.ok(g.players[id].alive);}
      for(const p of g.players)if(p.alive&&!res.stechen&&landed.has(bets[p.id])&&!res.fallen.includes(p.id))assert.ok(res.shieldsNext.includes(p.id));}}
  assert.ok(blocked>100);
});

test('Pulverfass springt in etwa 25 % der Fälle auf eine andere Burg über',()=>{
  let n=0,ch=0;for(let i=0;i<20000;i++){const g=game(5,{attacks:['pulver']});const s=R.playRound(g).strikes[0];n++;if(s.chain!=null){ch++;assert.notEqual(s.chain,s.target);assert.deepEqual(s.targets,[s.target,s.chain]);}}
  const p=ch/n,se=Math.sqrt(.25*.75/n);assert.ok(Math.abs(p-.25)<6*se,`Quote ${p}`);
});

test('Drache trifft genau die Burgen nahe seiner Flugbahn',()=>{
  for(let i=0;i<3000;i++){const ps=Array.from({length:6},(_,k)=>({name:'S'+k,x:(Math.random()*2-1)*7,z:(Math.random()*2-1)*6}));
    const g=R.createGame({players:ps,attacks:['drache']}),s=R.playRound(g).strikes[0],t=g.players[s.target],dx=Math.cos(s.dir),dz=Math.sin(s.dir);
    for(const p of g.players){const d=Math.abs((p.x-t.x)*dz-(p.z-t.z)*dx);assert.equal(s.targets.includes(p.id),p.id===s.target||d<=R.DRAGON_WIDTH);}}
});

test('Ohne Drachen hat jede Burg die gleiche Chance, König zu werden',()=>{
  const n=5,c=Array(n).fill(0);for(let i=0;i<20000;i++){const g=game(n,{attacks:['katapult','pulver','fluch']});while(!g.finished)R.playRound(g,randomBets(g));c[g.winner]++;}
  assert.ok(uniformity(c).p>ALPHA,JSON.stringify(c));
});

test('Jede Partie endet mit genau einem König, Plätze passen, Stechen belebt die Gefallenen',()=>{
  let stechen=0;
  for(let i=0;i<5000;i++){const n=2+i%7,g=game(n);let rounds=0;
    while(!g.finished){const r=R.playRound(g,randomBets(g));rounds++;assert.ok(rounds<200);
      assert.ok(r.strikes.length>=1&&r.strikes.length<=Math.max(1,n-1));
      if(r.stechen){stechen++;for(const s of r.strikes)for(const h of s.hits)if(h.fell)assert.equal(g.players[h.id].towers,1);}}
    const alive=g.players.filter(p=>p.alive);assert.equal(alive.length,1);assert.equal(alive[0].id,g.winner);assert.equal(alive[0].place,1);
    for(const p of g.players)if(p.id!==g.winner){assert.ok(p.place>=2&&p.place<=n);assert.equal(p.towers,0);}}
  assert.ok(stechen>0,'Stechen kommt vor');
});

test('Mehr Einschläge in späteren Runden, nie mehr als Lebende − 1',()=>{
  const g=game(8);const seen=[];
  for(let r=0;r<12;r++){g.round=r;seen.push(R.strikesFor(g));}
  assert.deepEqual(seen.slice(0,8),[1,1,1,1,2,2,2,3]);
  g.players.forEach((p,i)=>{if(i>1)p.alive=false;});g.round=20;assert.equal(R.strikesFor(g),1);
});

test('Königswette: Königsmacher sind genau die, die auf den König getippt haben',()=>{
  for(let i=0;i<500;i++){const g=game(4,{betMode:'start'});const kb={0:1,1:1,2:3,3:0};R.setKingBets(g,kb);while(!g.finished)R.playRound(g,{});
    assert.deepEqual(R.kingmakers(g),Object.keys(kb).map(Number).filter(k=>kb[k]===g.winner));
    for(const r of g.log)assert.equal(r.shieldsNext.length,0,'im Modus „nur am Anfang“ gibt es keine Rundenschilde');}
});

test('Fadenkreuz endet immer beim Ziel, Startpunkt gleichverteilt',()=>{
  const rng=rngOf(freshSeed());
  for(let i=0;i<20000;i++){const m=1+i%8,t=Math.floor(rng()*m),s=Math.floor(rng()*m),h=hops(m,s,t,rng);assert.equal(h.path[h.path.length-1],t);
    for(let j=1;j<h.path.length;j++)if(m>1)assert.notEqual(h.path[j],h.path[j-1]);}
  const g=game(6),c=Array(6).fill(0);for(let i=0;i<12000;i++){const gg=game(6,{attacks:['katapult']});const st=R.playRound(gg).strikes[0];c[gg.players.findIndex(p=>p.id===st.path[0])]++;}
  assert.ok(uniformity(c).p>ALPHA);void g;void chiP;
});
