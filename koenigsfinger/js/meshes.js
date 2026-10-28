// Prozedurale Low-Poly-Modelle. Jede Fläche bekommt ihre eigene Normale (Flat-Shading) und eine leicht variierte Farbe.
// Material: 0 Stein/Holz (beleuchtet), 1 Spielerfarbe, 2 Fahne (Spielerfarbe + Wehen), 3 leuchtend, 4 Metall/Gold, 5 Schutzkuppel, 6 Geist
import {v3} from './gl.js';

let seed=12345;const rnd=()=>((seed=Math.imul(seed^(seed>>>15),2246822519)+374761393>>>0)/4294967296);
const vary=(c,a=.06)=>{const k=1+(rnd()-.5)*2*a;return [c[0]*k,c[1]*k,c[2]*k];};
export const C={stone:[.62,.6,.56],stoneD:[.42,.4,.38],stoneL:[.74,.72,.66],wood:[.45,.3,.18],woodD:[.3,.2,.12],dark:[.08,.06,.06],grass:[.32,.52,.24],
  dirt:[.45,.36,.24],leaf:[.2,.42,.2],leafD:[.14,.32,.16],skin:[.86,.66,.52],metal:[.6,.62,.68],gold:[1,.76,.3],fire:[1,.6,.15],rock:[.5,.48,.46],
  dragon:[.32,.12,.1],dragonB:[.62,.36,.18],white:[.95,.95,.95]};

export class MB{
  constructor(){this.v=[];}
  tri(a,b,c,col,mat=0,n=null){n=n||v3.norm(v3.cross(v3.sub(b,a),v3.sub(c,a)));const cc=vary(col);
    for(const p of [a,b,c])this.v.push(p[0],p[1],p[2],n[0],n[1],n[2],cc[0],cc[1],cc[2],mat);}
  quad(a,b,c,d,col,mat){const cc=vary(col);const n=v3.norm(v3.cross(v3.sub(b,a),v3.sub(c,a)));
    for(const p of [a,b,c,a,c,d])this.v.push(p[0],p[1],p[2],n[0],n[1],n[2],cc[0],cc[1],cc[2],mat);}
  /* Quader, mittig in x/z, unten auf y */
  box(x,y,z,sx,sy,sz,col,mat=0,ry=0){const h=[sx/2,sz/2],c=Math.cos(ry),s=Math.sin(ry);
    const P=(dx,dy,dz)=>{const X=dx*h[0],Z=dz*h[1];return [x+X*c+Z*s,y+dy*sy,z-X*s+Z*c];};
    const p=[P(-1,0,-1),P(1,0,-1),P(1,0,1),P(-1,0,1),P(-1,1,-1),P(1,1,-1),P(1,1,1),P(-1,1,1)];
    this.quad(p[3],p[2],p[6],p[7],col,mat);this.quad(p[1],p[0],p[4],p[5],col,mat);this.quad(p[2],p[1],p[5],p[6],col,mat);
    this.quad(p[0],p[3],p[7],p[4],col,mat);this.quad(p[7],p[6],p[5],p[4],col,mat);this.quad(p[0],p[1],p[2],p[3],col,mat);return this;}
  /* Prisma/Kegelstumpf mit seg Seiten */
  cyl(x,y,z,r,h,seg,col,mat=0,{r2=r,top=true,bot=false,rot=0,topCol=null,jit=0}={}){
    for(let i=0;i<seg;i++){const a0=rot+i/seg*6.2832,a1=rot+(i+1)/seg*6.2832,j0=1+(jit?(Math.sin(i*12.9)*.5)*jit:0),j1=1+(jit?(Math.sin((i+1)*12.9)*.5)*jit:0);
      const b0=[x+Math.cos(a0)*r,y,z+Math.sin(a0)*r],b1=[x+Math.cos(a1)*r,y,z+Math.sin(a1)*r],t0=[x+Math.cos(a0)*r2,y+h*j0,z+Math.sin(a0)*r2],t1=[x+Math.cos(a1)*r2,y+h*j1,z+Math.sin(a1)*r2];
      this.quad(b1,b0,t0,t1,col,mat);
      if(top&&r2>0)this.tri([x,y+h,z],t1,t0,topCol||col,mat);if(bot)this.tri([x,y,z],b0,b1,col,mat);}return this;}
  cone(x,y,z,r,h,seg,col,mat=0,rot=0){for(let i=0;i<seg;i++){const a0=rot+i/seg*6.2832,a1=rot+(i+1)/seg*6.2832;
    this.tri([x+Math.cos(a1)*r,y,z+Math.sin(a1)*r],[x+Math.cos(a0)*r,y,z+Math.sin(a0)*r],[x,y+h,z],col,mat);}return this;}
  /* Kugel mit wenigen Segmenten, optional verbeult (Felsen) */
  ball(x,y,z,r,col,mat=0,{lat=5,lon=7,jit=0,sy=1}={}){const P=(i,j)=>{const t=i/lat*Math.PI,p=j/lon*6.2832,k=1+(jit&&i>0&&i<lat?(Math.sin(i*7.1+j*3.3)*.5+Math.sin(j*5.7)*.3)*jit:0);
      return [x+Math.sin(t)*Math.cos(p)*r*k,y+Math.cos(t)*r*sy*k,z+Math.sin(t)*Math.sin(p)*r*k];};
    for(let i=0;i<lat;i++)for(let j=0;j<lon;j++){const a=P(i,j),b=P(i+1,j),c=P(i+1,j+1),d=P(i,j+1);if(i>0)this.tri(a,b,d,col,mat);if(i<lat-1)this.tri(b,c,d,col,mat);}return this;}
  add(o){this.v.push(...o.v);return this;}
  build(){return new Float32Array(this.v);}
}

/* Glatte Ikosaeder-Kugel (für Schutzkuppel und Geist) */
export function smoothSphere(r,sub,mat,col){const t=(1+Math.sqrt(5))/2;let V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(v3.norm);
  let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let s=0;s<sub;s++){const nf=[],mid={};const m=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(mid[k]==null){mid[k]=V.length;V.push(v3.norm(v3.lerp(V[a],V[b],.5)));}return mid[k];};
    for(const [a,b,c] of F){const ab=m(a,b),bc=m(b,c),ca=m(c,a);nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}F=nf;}
  const out=[];for(const f of F)for(const i of f){const n=V[i];out.push(n[0]*r,n[1]*r,n[2]*r,n[0],n[1],n[2],col[0],col[1],col[2],mat);}return new Float32Array(out);}

/* ---------- Gelände und Bäume ---------- */
export function hgt(x,z){const d=Math.hypot(x*.85,z);const edge=Math.max(0,d-12);
  return Math.sin(x*.35)*Math.cos(z*.3)*.12+Math.sin(x*.9+z*.7)*.05+edge*edge*.035+Math.max(0,edge-4)*Math.sin(x*.4+z*.2)*.5;}
const hh=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);};
function vnoise(x,z){const i=Math.floor(x),j=Math.floor(z),f=x-i,g=z-j,u=f*f*(3-2*f),w=g*g*(3-2*g);
  return (hh(i,j)*(1-u)+hh(i+1,j)*u)*(1-w)+(hh(i,j+1)*(1-u)+hh(i+1,j+1)*u)*w;}
export function terrain(palette){const mb=new MB(),S=70,N=56,st=S/N;
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){const x0=-S/2+i*st,z0=-S/2+j*st,x1=x0+st,z1=z0+st;
    const P=(x,z)=>[x,hgt(x,z),z],a=P(x0,z0),b=P(x1,z0),c=P(x1,z1),d=P(x0,z1);
    const col=(p)=>{const h=p[1];if(h>2.2)return palette.rock;const n=vnoise(p[0]*.28,p[2]*.28)*.7+vnoise(p[0]*.9,p[2]*.9)*.3,k=Math.min(1,Math.max(0,(n-.55)/.18));
      return [0,1,2].map(i=>palette.grass[i]+(palette.dirt[i]-palette.grass[i])*k);};
    const m=[(a[0]+c[0])/2,(a[1]+c[1])/2,(a[2]+c[2])/2];
    if((i+j)%2){mb.tri(a,d,c,col(m));mb.tri(a,c,b,col(m));}else{mb.tri(a,d,b,col(m));mb.tri(b,d,c,col(m));}}
  return mb.build();}
export function forest(palette,avoid){const mb=new MB();seed=777;
  for(let k=0;k<420;k++){const a=rnd()*6.2832,r=11+rnd()*20,x=Math.cos(a)*r*1.2,z=Math.sin(a)*r;if(avoid(x,z))continue;const y=hgt(x,z)-.05,s=.7+rnd()*.9;
    if(rnd()<.62){mb.cyl(x,y,z,.09*s,.4*s,5,C.woodD);for(let l=0;l<3;l++)mb.cone(x,y+(.3+l*.42)*s,z,(.62-l*.15)*s,.75*s,6,l%2?palette.leaf:palette.leafD,0,rnd());}
    else if(rnd()<.6){mb.cyl(x,y,z,.08*s,.55*s,5,C.wood);mb.ball(x,y+.85*s,z,.5*s,palette.leaf,0,{lat:3,lon:6,jit:.25});}
    else mb.ball(x,y+.1,z,.35*s,C.rock,0,{lat:3,lon:5,jit:.35,sy:.6});}
  return mb.build();}

/* ---------- Burg (Mittelpunkt 0/0, Radius ~1.3; Vorderseite +z zur Kamera) ---------- */
export const TOWER_ANG=[-Math.PI/2,Math.PI/6,Math.PI*5/6];   // hinten, vorne rechts, vorne links
export const TOWER_R=.95,BASE_Y=.18;
export const towerPos=i=>[Math.cos(TOWER_ANG[i])*TOWER_R,BASE_Y,Math.sin(TOWER_ANG[i])*TOWER_R];
function crenel(mb,x,y,z,len,ang,col){const n=Math.max(2,Math.round(len/.16));for(let i=0;i<n;i++){const t=(i+.5)/n-.5;if(i%2)continue;
  mb.box(x+Math.cos(ang)*t*len,y,z-Math.sin(ang)*t*len,.09,.09,.18,col,0,ang);}}
export function castleCore(){const mb=new MB();seed=1;
  mb.cyl(0,-.05,0,1.55,BASE_Y+.05,10,C.dirt,0,{r2:1.42});
  mb.cyl(0,BASE_Y,0,1.3,.04,10,C.stoneD,0,{r2:1.28});
  // Bergfried mit Zinnen und Tor
  mb.box(0,BASE_Y,-.05,.86,1.05,.86,C.stoneL);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;crenel(mb,Math.sin(a)*.4,BASE_Y+1.05,-.05+Math.cos(a)*.4,.86,a+Math.PI/2,C.stoneL);}
  mb.box(0,BASE_Y,.38,.26,.38,.04,C.dark);mb.box(0,BASE_Y+.62,.39,.1,.16,.02,C.dark);mb.box(-.25,BASE_Y+.62,.39,.08,.14,.02,C.dark);mb.box(.25,BASE_Y+.62,.39,.08,.14,.02,C.dark);
  // Mauern zwischen den Türmen, vorne mit Torhaus
  for(let i=0;i<3;i++){const a=towerPos(i),b=towerPos((i+1)%3),mx=(a[0]+b[0])/2,mz=(a[2]+b[2])/2,len=Math.hypot(b[0]-a[0],b[2]-a[2])-.5,ang=Math.atan2(-(b[2]-a[2]),b[0]-a[0]);
    mb.box(mx,BASE_Y,mz,len,.55,.18,C.stone,0,ang);crenel(mb,mx,BASE_Y+.55,mz,len,ang,C.stone);}
  const f=[(towerPos(1)[0]+towerPos(2)[0])/2,0,(towerPos(1)[2]+towerPos(2)[2])/2];
  mb.box(f[0],BASE_Y,f[2]+.02,.42,.72,.3,C.stoneL);mb.box(f[0],BASE_Y,f[2]+.17,.24,.36,.02,C.dark);mb.box(f[0],BASE_Y+.72,f[2]+.02,.46,.06,.34,C.stoneD);
  // Fahnenmast
  mb.box(.3,BASE_Y+1.05,-.3,.04,.9,.04,C.woodD);
  return mb.build();}
export function tower(){const mb=new MB();seed=2;
  mb.cyl(0,0,0,.31,1.42,8,C.stone,0,{r2:.29,top:false});mb.cyl(0,1.42,0,.37,.1,8,C.stoneL,0,{top:true});
  for(let i=0;i<8;i+=2){const a=i/8*6.2832+.2;mb.box(Math.cos(a)*.33,1.52,Math.sin(a)*.33,.11,.1,.1,C.stoneL,0,-a);}
  mb.cone(0,1.52,0,.4,.62,8,[1,1,1],1);
  for(const y of [.55,.95]){mb.box(0,y,.29,.05,.14,.03,C.dark);}
  mb.box(0,.7,.31,.04,.06,.04,C.fire,3);   // Fackel
  return mb.build();}
export function rubble(){const mb=new MB();seed=3;
  mb.cyl(0,0,0,.33,.32,8,C.stoneD,0,{r2:.26,jit:.7});
  for(let i=0;i<7;i++){const a=rnd()*6.2832,r=.25+rnd()*.35;mb.box(Math.cos(a)*r,0,Math.sin(a)*r,.08+rnd()*.12,.06+rnd()*.08,.08+rnd()*.12,rnd()<.5?C.stoneD:C.stone,0,rnd()*3);}
  return mb.build();}
export function keepRuin(){const mb=new MB();seed=4;
  mb.box(-.25,BASE_Y,-.05,.35,.5,.8,C.stoneD,0,.1);mb.box(.28,BASE_Y,0,.3,.32,.7,C.stoneD,0,-.15);mb.box(0,BASE_Y,-.35,.8,.22,.2,C.stone);
  for(let i=0;i<10;i++){const a=rnd()*6.2832,r=rnd()*.7;mb.box(Math.cos(a)*r,BASE_Y,Math.sin(a)*r,.1+rnd()*.14,.06+rnd()*.1,.1+rnd()*.14,C.stoneD,0,rnd()*3);}
  return mb.build();}
/* Fahne als Gitter (Material 2: Spielerfarbe, wird im Shader bewegt) */
export function flag(){const mb=new MB(),W=6,H=4,w=.5,h=.32;for(let i=0;i<W;i++)for(let j=0;j<H;j++){const P=(a,b)=>[a/W*w,-b/H*h,0];
  mb.quad(P(i,j+1),P(i+1,j+1),P(i+1,j),P(i,j),[1,1,1],2);mb.quad(P(i,j),P(i+1,j),P(i+1,j+1),P(i,j+1),[.85,.85,.85],2);}return mb.build();}
/* Figur (Wache oder Burgherr): Tunika in Spielerfarbe; Burgherr mit Umhang */
export function figure(lord=false){const mb=new MB();seed=lord?6:5;const s=lord?1.25:1;
  mb.box(-.035*s,0,0,.05*s,.1*s,.06*s,C.woodD);mb.box(.035*s,0,0,.05*s,.1*s,.06*s,C.woodD);
  mb.box(0,.1*s,0,.13*s,.12*s,.08*s,[1,1,1],1);mb.box(0,.22*s,0,.08*s,.08*s,.08*s,C.skin);
  if(lord){mb.box(0,.08*s,-.05*s,.15*s,.16*s,.02*s,[.8,.8,.8],1);}else{mb.box(0,.29*s,0,.09*s,.035*s,.09*s,C.metal,4);mb.box(.09*s,.05*s,0,.015,.3*s,.015,C.woodD);mb.box(.09*s,.33*s,0,.03,.06,.01,C.metal,4);}
  return mb.build();}
export function ghost(){const mb=new MB();seed=7;mb.ball(0,.55,0,.22,C.white,6,{lat:4,lon:8});mb.cone(0,0,0,.24,.5,8,C.white,6);
  mb.box(-.07,.55,.19,.05,.07,.02,C.dark,6);mb.box(.07,.55,.19,.05,.07,.02,C.dark,6);return mb.build();}

/* ---------- Angreifer und Geschosse ---------- */
export function boulder(){const mb=new MB();seed=8;mb.ball(0,0,0,.28,C.rock,0,{lat:4,lon:6,jit:.3});return mb.build();}
export function keg(){const mb=new MB();seed=9;mb.cyl(0,-.22,0,.17,.44,10,C.wood,0,{bot:true});mb.cyl(0,-.17,0,.178,.05,10,C.dark);mb.cyl(0,.12,0,.178,.05,10,C.dark);
  mb.box(0,.22,0,.02,.12,.02,C.dark);mb.box(0,.34,0,.04,.04,.04,C.fire,3);return mb.build();}
export function catapult(){const mb=new MB();seed=10;
  mb.box(0,.12,0,.9,.1,.5,C.wood);for(const [x,z] of [[-.35,-.28],[.35,-.28],[-.35,.28],[.35,.28]])mb.cyl(x,.12,z,.13,.04,8,C.woodD,0,{rot:0});
  mb.box(-.1,.22,-.18,.08,.5,.08,C.woodD);mb.box(-.1,.22,.18,.08,.5,.08,C.woodD);mb.box(-.1,.68,0,.08,.08,.44,C.woodD);
  return mb.build();}
export function catapultArm(){const mb=new MB();seed=11;mb.box(0,0,0,.07,.07,.07,C.woodD);mb.box(.45,-.03,0,.95,.06,.06,C.wood,0,0);mb.box(.9,0,0,.16,.06,.18,C.woodD);return mb.build();}
export function dragonBody(){const mb=new MB();seed=12;const D=C.dragon,B=C.dragonB;
  mb.ball(0,0,0,.42,D,0,{lat:4,lon:7,sy:.75});mb.ball(0,-.08,.1,.3,B,0,{lat:3,lon:6,sy:.6});
  mb.cyl(0,.05,.3,.16,.6,6,D,0,{r2:.1,rot:0});   // Hals (wird als Kegel nach vorn gedreht – siehe Modell unten)
  return mb.build();}
export function dragonHead(){const mb=new MB();seed=13;const D=C.dragon;
  mb.box(0,-.08,0,.26,.18,.36,D);mb.box(0,-.1,.28,.2,.1,.3,D);mb.box(0,-.17,.3,.18,.04,.26,C.dark);
  mb.cone(-.08,.08,-.08,.04,.22,4,C.stoneL);mb.cone(.08,.08,-.08,.04,.22,4,C.stoneL);
  mb.box(-.09,.0,.12,.05,.04,.04,[1,.85,.2],3);mb.box(.09,.0,.12,.05,.04,.04,[1,.85,.2],3);return mb.build();}
export function dragonWing(){const mb=new MB();seed=14;const M=[.45,.14,.12],R=C.dragon;
  const p=[[0,0,0],[1.6,.1,-.3],[2.3,0,.25],[1.5,0,.7],[.8,0,.55],[.2,0,.45]];
  for(let i=1;i<p.length-1;i++){mb.tri(p[0],p[i],p[i+1],M);mb.tri(p[0],p[i+1],p[i],M);}
  for(let i=1;i<4;i++)mb.box(p[i][0]/2,0,p[i][2]/2,Math.hypot(p[i][0],p[i][2]),.03,.04,R,0,-Math.atan2(p[i][2],p[i][0]));
  return mb.build();}
export function dragonTail(){const mb=new MB();seed=15;mb.cyl(0,0,0,.18,1.2,6,C.dragon,0,{r2:.02,top:false});mb.cone(0,1.15,0,.12,.25,4,C.stoneL);return mb.build();}

/* Krone (Material 4 Gold, Edelsteine leuchtend in Spielerfarbe = Material 1) */
export function crown(){const mb=new MB();seed=16;const SEG=40,PK=5,top=i=>{const u=(i/SEG*PK)%1;return .36+.5*Math.pow(1-Math.abs(u*2-1),1.6);};
  for(let i=0;i<SEG;i++){const a0=i/SEG*6.2832,a1=(i+1)/SEG*6.2832,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1),h0=top(i),h1=top(i+1),r=.86;
    mb.quad([c0,0,s0],[c1,0,s1],[c1,h1,s1],[c0,h0,s0],C.gold,4);mb.quad([c1*r,0,s1*r],[c0*r,0,s0*r],[c0*r,h0,s0*r],[c1*r,h1,s1*r],C.gold,4);
    mb.quad([c0*1.06,0,s0*1.06],[c1*1.06,0,s1*1.06],[c1*1.06,.14,s1*1.06],[c0*1.06,.14,s0*1.06],C.gold,4);}
  for(let k=0;k<PK;k++){const a=(k+.5)/PK*6.2832;mb.ball(Math.cos(a),.92,Math.sin(a),.08,C.white,4,{lat:3,lon:5});mb.ball(Math.cos(a)*1.03,.25,Math.sin(a)*1.03,.09,[1,1,1],1,{lat:3,lon:5});}
  return mb.build();}
/* Ring-Markierung am Boden (Fadenkreuz) */
export function reticle(){const mb=new MB(),n=32;for(let i=0;i<n;i++){const a0=i/n*6.2832,a1=(i+1)/n*6.2832,r0=1.45,r1=1.62;
  mb.quad([Math.cos(a0)*r0,0,Math.sin(a0)*r0],[Math.cos(a0)*r1,0,Math.sin(a0)*r1],[Math.cos(a1)*r1,0,Math.sin(a1)*r1],[Math.cos(a1)*r0,0,Math.sin(a1)*r0],[1,.2,.1],3);}
  for(let k=0;k<4;k++){const a=k*Math.PI/2;mb.box(Math.cos(a)*1.9,0,Math.sin(a)*1.9,.55,.02,.08,[1,.25,.1],3,-a);}return mb.build();}
