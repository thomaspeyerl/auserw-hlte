// Fairness- und Zufallstests für den Zufallskern aus index.html.
// Ausführen im Repo-Root mit:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFate,chiP,uniformity,independence,ALPHA,pct} from './helpers.mjs';

const Fate=loadFate();
const players=n=>Array.from({length:n},(_,id)=>({id,x:Math.random()*400,y:Math.random()*800}));
const fmtP=p=>p<1e-4?p.toExponential(1):p.toFixed(4);
// Liefert nacheinander die angegebenen Werte – damit lässt sich plan() gezielt ansteuern.
const seq=(...v)=>{let i=0;return ()=>v[i++];};

test('Statistik-Hilfsfunktion trifft bekannte Chi-Quadrat-Quantile',()=>{
  for(const [chi,df] of [[3.841,1],[5.991,2],[11.070,5],[18.307,10],[293.248,255]])
    assert.ok(Math.abs(chiP(chi,df)-0.05)<5e-4,`df=${df}: ${chiP(chi,df)}`);
  assert.ok(Math.abs(chiP(6.635,1)-0.01)<1e-4);
  assert.ok(Math.abs(chiP(23.209,10)-0.01)<1e-4);
});

test('sfc32 entspricht der Referenzdefinition (PractRand SFC32)',()=>{
  // Unabhängige BigInt-Umsetzung. Der Kern erhöht den Zähler vor der Nutzung (Variante nach bryc),
  // das entspricht SFC32 mit Startzähler d+1.
  const M=0xffffffffn;
  const ref=(a,b,c,d)=>{[a,b,c]=[a,b,c].map(BigInt);let ctr=(BigInt(d)+1n)&M;
    return ()=>{const t=(a+b+ctr)&M;ctr=(ctr+1n)&M;a=b^(b>>9n);b=(c+(c<<3n))&M;c=((((c<<21n)|(c>>11n))&M)+t)&M;return Number(t)/4294967296;};};
  for(let k=0;k<50;k++){
    const s=crypto.getRandomValues(new Uint32Array(4)),a=Fate.sfc32(...s),b=ref(...s);
    for(let i=0;i<2000;i++)assert.equal(a(),b());
  }
});

test('Index aus rng() ist exakt fair: Abweichung höchstens 1 von 2^32 Werten',t=>{
  const T=2n**32n;
  for(let n=2;n<=12;n++){
    const N=BigInt(n),lo=i=>(BigInt(i)*T+N-1n)/N; // kleinstes k mit floor(k*n/2^32) = i
    const counts=[];
    for(let i=0;i<n;i++){
      counts.push(lo(i+1)-lo(i));
      // Grenzen direkt mit plan() prüfen: genau dort springt der Index um
      assert.equal(Fate.plan(n,seq(Number(lo(i))/2**32,0,0)).win,i);
      if(i)assert.equal(Fate.plan(n,seq((Number(lo(i))-1)/2**32,0,0)).win,i-1);
    }
    const max=counts.reduce((m,c)=>c>m?c:m),min=counts.reduce((m,c)=>c<m?c:m);
    assert.ok(max-min<=1n,`n=${n}: ${counts}`);
  }
  t.diagnostic('jeder Spieler bekommt 2^32/n ± 1 der möglichen Zufallswerte (relative Abweichung < 3·10⁻⁹)');
});

test('Markierung landet nach steps Sprüngen immer auf dem Gewinner (alle Fälle 2–12 Spieler)',()=>{
  for(let n=2;n<=12;n++)for(let win=0;win<n;win++)for(let start=0;start<n;start++)for(const lap of [.25,.75]){
    const p=Fate.plan(n,seq((win+.5)/n,(start+.5)/n,lap));
    assert.equal(p.win,win);assert.equal(p.start,start);
    let hl=p.start;for(let i=0;i<p.steps;i++)hl=(hl+1)%n; // genau so springt die Markierung im Spiel
    assert.equal(hl,win,`n=${n} win=${win} start=${start}`);
    assert.ok(p.steps>=3*n,'mindestens drei volle Umläufe für die Spannung');
  }
});

test('Gewinner ist gleichverteilt (2–12 Spieler, je 100 000 Runden)',t=>{
  for(let n=2;n<=12;n++){
    const counts=new Array(n).fill(0),list=players(n);
    for(let r=0;r<100000;r++){const p=Fate.draw(list);counts[p.order[p.win].id]++;}
    const u=uniformity(counts);
    t.diagnostic(`${String(n).padStart(2)} Spieler: max. Abweichung ${pct(u.maxDev)}, p=${fmtP(u.p)}`);
    assert.ok(u.p>ALPHA,`n=${n}: p=${u.p}, Zählung ${counts}`);
  }
});

test('Reihenfolge des Auflegens bringt keinen Vorteil (zufällige Positionen je Runde)',t=>{
  const n=5,counts=new Array(n).fill(0);
  for(let r=0;r<100000;r++){const p=Fate.draw(players(n));counts[p.order[p.win].id]++;}
  const u=uniformity(counts);
  t.diagnostic(`Gewinnquote nach Auflege-Reihenfolge: ${counts.map(c=>pct(c/1e5)).join(' · ')}`);
  assert.ok(u.p>ALPHA,`p=${u.p}`);
});

test('Auch ungewöhnliche Anordnungen bleiben fair (alle an einer Stelle, alle auf einer Linie)',()=>{
  const layouts={stapel:n=>Array.from({length:n},(_,id)=>({id,x:200,y:400})),linie:n=>Array.from({length:n},(_,id)=>({id,x:40+id*30,y:400}))};
  for(const [name,mk] of Object.entries(layouts)){
    const n=6,counts=new Array(n).fill(0),list=mk(n);
    for(let r=0;r<60000;r++){const p=Fate.draw(list);assert.equal(p.order.length,n);counts[p.order[p.win].id]++;}
    assert.ok(uniformity(counts).p>ALPHA,`${name}: ${counts}`);
  }
});

test('Startpunkt der Markierung verrät nichts über den Gewinner',t=>{
  const n=6,table=Array.from({length:n},()=>new Array(n).fill(0)),list=players(n);
  for(let r=0;r<120000;r++){const p=Fate.draw(list);table[p.start][p.win]++;}
  const r=independence(table);
  t.diagnostic(`Chi² = ${r.chi.toFixed(1)} bei ${r.df} Freiheitsgraden, p=${fmtP(r.p)}`);
  assert.ok(r.p>ALPHA,`p=${r.p}`);
});

test('Aufeinanderfolgende Runden sind unabhängig',t=>{
  const n=4,table=Array.from({length:n},()=>new Array(n).fill(0)),list=players(n);
  let prev=null;
  for(let r=0;r<100000;r++){const p=Fate.draw(list),w=p.order[p.win].id;if(prev!==null)table[prev][w]++;prev=w;}
  const r=independence(table);
  t.diagnostic(`Gewinner Runde k vs. k+1: Chi² = ${r.chi.toFixed(1)} bei ${r.df} Freiheitsgraden, p=${fmtP(r.p)}`);
  assert.ok(r.p>ALPHA,`p=${r.p}`);
});

test('Rundenlänge: 3–4 Umläufe (ab 5 Spielern) bzw. 4–5 Umläufe, je zur Hälfte',()=>{
  for(const n of [3,7]){
    const allowed=n>=5?[3,4]:[4,5],counts=[0,0],list=players(n);
    for(let r=0;r<50000;r++){const p=Fate.draw(list);const i=allowed.indexOf(p.laps);assert.ok(i>=0,`laps=${p.laps}`);counts[i]++;}
    assert.ok(uniformity(counts).p>ALPHA,`n=${n}: ${counts}`);
  }
});

test('Jede Runde bekommt einen neuen Seed, alle 128 Bits ausgeglichen',t=>{
  const N=200000,seen=new Set(),ones=new Array(128).fill(0);
  for(let r=0;r<N;r++){
    const s=Fate.freshSeed();seen.add(s.join(','));
    for(let w=0;w<4;w++)for(let b=0;b<32;b++)ones[w*32+b]+=(s[w]>>>b)&1;
  }
  assert.equal(seen.size,N,'kein Seed darf sich wiederholen');
  const z=ones.map(c=>Math.abs(c-N/2)/Math.sqrt(N/4)),maxZ=Math.max(...z);
  t.diagnostic(`${N} Seeds, alle verschieden; größte Bit-Abweichung ${maxZ.toFixed(2)} σ`);
  assert.ok(maxZ<6,`Bit ${z.indexOf(maxZ)}: ${maxZ} σ`);
});

test('sfc32-Ausgabe ist gleichverteilt und ohne Korrelation aufeinanderfolgender Werte',t=>{
  const s=Fate.freshSeed(),rng=Fate.sfc32(...s),N=1000000,hi=new Array(256).fill(0),lo=new Array(256).fill(0);
  let prev=rng(),sx=0,sy=0,sxy=0,sxx=0,syy=0;
  for(let i=0;i<N;i++){
    const u=rng();hi[Math.floor(u*256)]++;lo[(u*4294967296)&255]++;
    sx+=prev;sy+=u;sxy+=prev*u;sxx+=prev*prev;syy+=u*u;prev=u;
  }
  const corr=(N*sxy-sx*sy)/Math.sqrt((N*sxx-sx*sx)*(N*syy-sy*sy)),uh=uniformity(hi),ul=uniformity(lo);
  t.diagnostic(`obere 8 Bit p=${fmtP(uh.p)}, untere 8 Bit p=${fmtP(ul.p)}, Korrelation ${corr.toExponential(1)}`);
  assert.ok(uh.p>ALPHA&&ul.p>ALPHA,`hi p=${uh.p}, lo p=${ul.p}`);
  assert.ok(Math.abs(corr)<6/Math.sqrt(N),`Korrelation ${corr}`);
});

test('Ohne Web Crypto (alter Browser) funktioniert der Fallback und bleibt fair',()=>{
  const F=loadFate({crypto:undefined}),seen=new Set();
  for(let r=0;r<20000;r++){const s=F.freshSeed();assert.ok(s[0]|s[1]|s[2]|s[3]);seen.add(s.join(','));}
  assert.equal(seen.size,20000);
  const n=3,counts=new Array(n).fill(0),list=players(n);
  for(let r=0;r<60000;r++){const p=F.draw(list);counts[p.order[p.win].id]++;}
  assert.ok(uniformity(counts).p>ALPHA,`${counts}`);
});

test('Gegenprobe: die Tests erkennen eine absichtlich eingebaute Verzerrung von 2 %',t=>{
  // Manipulierte Auswahl: in 2 % der Runden gewinnt immer Spieler 0
  const n=4,counts=new Array(n).fill(0);
  for(let r=0;r<100000;r++){const s=Fate.freshSeed(),rng=Fate.sfc32(...s);counts[rng()<.02?0:Math.floor(rng()*n)]++;}
  const u=uniformity(counts);
  t.diagnostic(`manipulierte Auswahl: p=${fmtP(u.p)} → wird erkannt`);
  assert.ok(u.p<ALPHA,`Verzerrung wurde nicht erkannt: p=${u.p}`);
});
