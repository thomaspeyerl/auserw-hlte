// Zufallskern von Königsfinger: frischer 128-Bit-Seed pro Spiel (Web Crypto + Entropie aus Berührungen), daraus sfc32.
// Reines Modul ohne DOM – wird von den Tests direkt importiert.

let entropy=(Math.random()*4294967296)>>>0;
export function mix(x,y,t){entropy=Math.imul(entropy^((x*1000)|0)^(((y*1000)|0)<<7)^((t*1000)|0),2654435761)>>>0;}

export function sfc32(a,b,c,d){return function(){a>>>=0;b>>>=0;c>>>=0;d>>>=0;let t=(a+b)|0;a=b^(b>>>9);b=(c+(c<<3))|0;c=(c<<21)|(c>>>11);d=(d+1)|0;t=(t+d)|0;c=(c+t)|0;return (t>>>0)/4294967296;};}

export function freshSeed(){const s=new Uint32Array(4);
  if(typeof crypto!=='undefined'&&crypto.getRandomValues)crypto.getRandomValues(s);else for(let i=0;i<4;i++)s[i]=(Math.random()*4294967296)>>>0;
  const now=typeof performance!=='undefined'?performance.now():Date.now();
  s[0]^=(now*1000)>>>0;s[1]^=Date.now()>>>0;s[2]^=entropy;s[3]^=(Math.random()*4294967296)>>>0;
  if(!(s[0]|s[1]|s[2]|s[3]))s[3]=1;return s;}

export const hexOf=s=>[...s].map(v=>v.toString(16).padStart(8,'0')).join('').toUpperCase();
export const seedOfHex=h=>Uint32Array.from({length:4},(_,i)=>parseInt(h.slice(i*8,i*8+8),16)>>>0);

/* Generator aus einem Seed; die ersten 24 Werte werden verworfen, damit sich ähnliche Seeds sofort entkoppeln */
export function rngOf(seed){const r=sfc32(seed[0],seed[1],seed[2],seed[3]);for(let i=0;i<24;i++)r();return r;}

/* Gleichverteilter Index 0..n-1 */
export const pick=(rng,n)=>Math.floor(rng()*n);

/* Weg des Fadenkreuzes über m Burgen (Indizes 0..m-1, im Kreis sortiert): erst wilde Sprünge, dann im Uhrzeigersinn
   auslaufend bis zum Ziel. Reine Show – das Ziel steht vorher fest. */
export function hops(m,start,target,rng,chaosBase=5){const path=[start];let cur=start;
  if(m<2)return {path:[target],chaos:0};
  if(m<3){const steps=(3+pick(rng,2))*m+((target-start+m)%m);for(let i=0;i<steps;i++){cur=(cur+1)%m;path.push(cur);}return {path,chaos:0};}
  const C=chaosBase+m+pick(rng,m),F=m+1+pick(rng,m),o=((target-F)%m+m)%m;
  for(let j=1;j<=C;j++){let nx=o;if(j<C){const ban=j===C-1?o:-1;do nx=pick(rng,m);while(nx===cur||nx===ban);}path.push(nx);cur=nx;}
  for(let j=0;j<F;j++){cur=(cur+1)%m;path.push(cur);}
  return {path,chaos:C};}
