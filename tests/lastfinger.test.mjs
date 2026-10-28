// Fairness-Tests für Last Finger Standing (lastfinger/index.html): K.-o.-Plan aus dem echten Zufallskern der Seite.
// Ausführen im Repo-Root mit:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFate,uniformity,independence,ALPHA,pct} from './helpers.mjs';

const Fate=loadFate({},'../lastfinger/index.html');
const players=n=>Array.from({length:n},(_,id)=>({id,x:Math.random()*400,y:Math.random()*800}));
const fmtP=p=>p<1e-4?p.toExponential(1):p.toFixed(4);
const fact=n=>n<2?1:n*fact(n-1);

test('Ausscheide-Reihenfolge: alle 24 Reihenfolgen bei 4 Spielern gleich wahrscheinlich',t=>{
  const list=players(4),counts=new Map();
  for(let r=0;r<240000;r++){const k=Fate.knockout(list),key=[...k.elim,k.winner].join('');counts.set(key,(counts.get(key)||0)+1);}
  assert.equal(counts.size,fact(4),'jede Reihenfolge muss vorkommen');
  const u=uniformity([...counts.values()]);
  t.diagnostic(`24 Reihenfolgen, max. Abweichung ${pct(u.maxDev)}, p=${fmtP(u.p)}`);
  assert.ok(u.p>ALPHA,`p=${u.p}`);
});

test('Sieger ist gleichverteilt (2–8 Spieler, je 60 000 Spiele)',t=>{
  for(let n=2;n<=8;n++){
    const counts=new Array(n).fill(0),list=players(n);
    for(let r=0;r<60000;r++){const k=Fate.knockout(list);counts[k.order[k.winner].id]++;}
    const u=uniformity(counts);
    t.diagnostic(`${n} Spieler: max. Abweichung ${pct(u.maxDev)}, p=${fmtP(u.p)}`);
    assert.ok(u.p>ALPHA,`n=${n}: ${counts}`);
  }
});

test('Wer zuerst rausfliegt, ist unabhängig davon, wer gewinnt',t=>{
  const n=5,table=Array.from({length:n},()=>new Array(n).fill(0)),list=players(n);
  for(let r=0;r<150000;r++){const k=Fate.knockout(list);table[k.elim[0]][k.winner]++;}
  // Diagonale ist unmöglich (wer zuerst rausfliegt, kann nicht gewinnen) – deshalb die Paare außerhalb der Diagonale prüfen
  const off=[];table.forEach((row,i)=>row.forEach((c,j)=>{if(i===j)assert.equal(c,0);else off.push(c);}));
  const u=uniformity(off);
  t.diagnostic(`20 mögliche Paare (erster raus, Sieger): max. Abweichung ${pct(u.maxDev)}, p=${fmtP(u.p)}`);
  assert.ok(u.p>ALPHA,`p=${u.p}`);
});

test('Reihenfolge des Auflegens bringt keinen Vorteil (zufällige Positionen je Spiel)',t=>{
  const n=5,counts=new Array(n).fill(0);
  for(let r=0;r<100000;r++){const k=Fate.knockout(players(n));counts[k.order[k.winner].id]++;}
  t.diagnostic(`Siegquote nach Auflege-Reihenfolge: ${counts.map(c=>pct(c/1e5)).join(' · ')}`);
  assert.ok(uniformity(counts).p>ALPHA);
});

test('Bombe: jeder Weg endet beim geplanten Opfer und bleibt bei den Lebenden (2–12 Spieler)',()=>{
  for(let n=2;n<=12;n++)for(let r=0;r<400;r++){
    const k=Fate.knockout(players(n)),dead=new Set();
    assert.equal(k.rounds.length,n-1);assert.equal(k.elim.length,n-1);
    assert.deepEqual([...k.elim,k.winner].sort((a,b)=>a-b),[...Array(n).keys()],'jeder Spieler kommt genau einmal vor');
    k.rounds.forEach((R,i)=>{
      const A=R.alive,m=A.length,P=R.path;
      assert.equal(R.target,k.elim[i]);assert.equal(m,n-i);
      assert.deepEqual(A,[...Array(n).keys()].filter(x=>!dead.has(x)),'nur Lebende sind im Spiel');
      assert.ok(A.includes(P[0]));assert.equal(P[P.length-1],R.target,'Bombe landet beim geplanten Opfer');
      for(let j=1;j<P.length;j++){assert.ok(A.includes(P[j]),'Bombe springt nie zu Ausgeschiedenen');assert.notEqual(P[j],P[j-1]);}
      for(let j=R.chaos+1;j<P.length;j++)assert.equal(P[j],A[(A.indexOf(P[j-1])+1)%m],'Auslauf im Uhrzeigersinn');
      if(m>=3)assert.ok(R.chaos>=m&&P.length-1-R.chaos>=m+1,'erst Chaos, dann mindestens eine Runde Auslauf');
      dead.add(R.target);});
    assert.ok(!dead.has(k.winner),'der Sieger fliegt nie raus');
  }
});
