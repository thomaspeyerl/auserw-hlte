// Lädt den Zufallskern (<script id="fate">) direkt aus den Spielseiten, damit genau der ausgelieferte Code geprüft wird.
import {readFileSync} from 'node:fs';

const SRC={};
const fateSrc=file=>SRC[file]||(SRC[file]=readFileSync(new URL(file,import.meta.url),'utf8').match(/<script id="fate">([\s\S]*?)<\/script>/)[1]);

// overrides ersetzt globale Namen im Kern, z. B. {crypto: undefined} für den Fallback ohne Web Crypto.
// file wählt die Seite: '../index.html' (Der Auserwählte) oder '../lastfinger/index.html' (Last Finger Standing).
export function loadFate(overrides={},file='../index.html'){
  const names=Object.keys(overrides);
  return new Function(...names,fateSrc(file)+'\nreturn Fate;')(...names.map(n=>overrides[n]));
}

// ---------- Statistik ----------

function lgamma(x){ // Lanczos-Näherung
  const c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,
    12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if(x<0.5)return Math.log(Math.PI/Math.sin(Math.PI*x))-lgamma(1-x);
  x-=1;let a=c[0];const t=x+7.5;
  for(let i=1;i<9;i++)a+=c[i]/(x+i);
  return 0.5*Math.log(2*Math.PI)+(x+0.5)*Math.log(t)-t+Math.log(a);
}

// Regularisierte obere unvollständige Gammafunktion Q(a,x) (Numerical Recipes, gammq)
function gammq(a,x){
  if(x<=0)return 1;
  const lead=Math.exp(-x+a*Math.log(x)-lgamma(a));
  if(x<a+1){
    let ap=a,del=1/a,sum=del;
    for(let n=0;n<1000;n++){ap++;del*=x/ap;sum+=del;if(Math.abs(del)<Math.abs(sum)*1e-15)break;}
    return 1-sum*lead;
  }
  const tiny=1e-300;let b=x+1-a,c=1/tiny,d=1/b,h=d;
  for(let i=1;i<1000;i++){
    const an=-i*(i-a);b+=2;
    d=an*d+b;if(Math.abs(d)<tiny)d=tiny;
    c=b+an/c;if(Math.abs(c)<tiny)c=tiny;
    d=1/d;const del=d*c;h*=del;
    if(Math.abs(del-1)<1e-15)break;
  }
  return lead*h;
}

// p-Wert eines Chi-Quadrat-Werts mit df Freiheitsgraden
export const chiP=(chi,df)=>gammq(df/2,chi/2);

// Anpassungstest gegen Gleichverteilung
export function uniformity(counts){
  const N=counts.reduce((s,c)=>s+c,0),E=N/counts.length;
  const chi=counts.reduce((s,c)=>s+(c-E)**2/E,0),df=counts.length-1;
  const maxDev=Math.max(...counts.map(c=>Math.abs(c-E)/E));
  return {chi,df,p:chiP(chi,df),maxDev};
}

// Unabhängigkeitstest für eine Kreuztabelle table[zeile][spalte]
export function independence(table){
  const rows=table.map(r=>r.reduce((s,c)=>s+c,0)),cols=table[0].map((_,j)=>table.reduce((s,r)=>s+r[j],0));
  const N=rows.reduce((s,c)=>s+c,0);let chi=0;
  table.forEach((r,i)=>r.forEach((o,j)=>{const e=rows[i]*cols[j]/N;chi+=(o-e)**2/e;}));
  const df=(rows.length-1)*(cols.length-1);
  return {chi,df,p:chiP(chi,df)};
}

// Signifikanzniveau: so streng, dass ein fairer Generator praktisch nie durchfällt (≈ 1 Fehlalarm pro Million Läufe),
// aber echte Verzerrungen von 1–2 % bei den verwendeten Stichproben trotzdem sicher auffallen.
export const ALPHA=1e-6;

export const pct=x=>(x*100).toFixed(2)+' %';
