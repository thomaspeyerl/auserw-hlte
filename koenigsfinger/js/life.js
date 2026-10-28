// Leben in der Welt: Bauern, Kühe, Schafe, Krähen, Vogelschwärme, brennend abstürzende Wachen,
// abgetrennte Gliedmaßen und liegen bleibende Leichen. Alles reine Optik – beeinflusst die Spielregeln nicht.
import {m4,v3,clamp,lerp} from './gl.js';
import * as M from './meshes.js';

const RAND=Math.random,rr=(a,b)=>a+RAND()*(b-a);
const FIELD={x:11,z0:-8.5,z1:9.5};
const POP={farmer:3,cow:3,sheep:4};
const SPEED={farmer:.55,cow:.3,sheep:.42};
const COL={farmer:[.55,.42,.26],cow:[.92,.9,.86],sheep:[.96,.95,.9]};
const angTo=(dx,dz)=>Math.atan2(dx,dz);

export class Life{
  constructor(w){this.w=w;this.folk=[];this.corpses=[];this.crows=[];this.birds=[];this.fallers=[];this.limbs=[];this.nextSpawn=0;this.nextFlock=rr(6,14);}
  reset(){this.folk.length=0;this.corpses.length=0;this.crows.length=0;this.birds.length=0;this.fallers.length=0;this.limbs.length=0;this.nextSpawn=this.w.time+1;}
  /* Platz außerhalb der Burgen */
  free(x,z,pad=2.3){for(const c of this.w.castles.values())if(Math.hypot(c.x-x,c.z-z)<pad)return false;return Math.abs(x)<FIELD.x&&z>FIELD.z0&&z<FIELD.z1;}
  spot(){for(let i=0;i<60;i++){const x=rr(-FIELD.x,FIELD.x),z=rr(FIELD.z0,FIELD.z1);if(this.free(x,z))return [x,z];}return [rr(-FIELD.x,FIELD.x),FIELD.z1];}
  populate(){for(const kind of Object.keys(POP)){const n=POP[kind]-this.folk.filter(f=>f.kind===kind).length;for(let i=0;i<n;i++){const [x,z]=this.spot();this.add(kind,x,z);}}}
  add(kind,x,z){const f={kind,x,z,ry:RAND()*6.28,tx:x,tz:z,wait:rr(0,3),flee:0,fx:0,fz:0,ph:RAND()*6};this.folk.push(f);return f;}

  /* Gefahr bei pos: alles in der Nähe flieht (Krähen fliegen auf) */
  alarm(p,r=7){for(const f of this.folk){const dx=f.x-p[0],dz=f.z-p[2],d=Math.hypot(dx,dz);if(d<r){f.flee=rr(2,3.5);const k=1/(d||1);f.fx=dx*k;f.fz=dz*k;}}
    for(const c of this.crows){if(Math.hypot(c.x-p[0],c.z-p[2])<r+2&&c.state!=='circle'){c.state='circle';c.t=0;c.y=Math.max(c.y,1);this.w.onCaw&&this.w.onCaw();}}}
  /* Explosion: was zu nah steht, stirbt */
  blast(p,r=1.6){for(let i=this.folk.length-1;i>=0;i--){const f=this.folk[i];if(Math.hypot(f.x-p[0],f.z-p[2])<r){this.folk.splice(i,1);this.kill(f.kind,[f.x,M.hgt(f.x,f.z)+.15,f.z],f.ry);}}
    for(let i=this.crows.length-1;i>=0;i--){const c=this.crows[i];if(Math.hypot(c.x-p[0],c.z-p[2])<r){this.crows.splice(i,1);this.w.burst([c.x,c.y,c.z],{n:30,col:[.05,.05,.07],speed:3,type:1,life:1.2,size:.06,g:-6});}}}
  kill(kind,p,ry){const w=this.w;
    if(kind==='sheep')w.burst(p,{n:60,col:[.95,.95,.9],speed:3,type:0,life:1.4,size:.25,g:-1,drag:.92});
    w.gore(p,COL[kind]||[.6,.5,.4],kind==='cow'?1.3:.8);this.corpse(kind,p[0],p[2],ry);
    if(kind==='farmer')w.onScream&&w.onScream();else if(kind==='cow')w.onMoo&&w.onMoo();else w.onBaa&&w.onBaa();}
  corpse(kind,x,z,ry=RAND()*6.28,col=null){if(this.corpses.length>=50)this.corpses.shift();const y=M.hgt(x,z);
    this.corpses.push({kind,x,y,z,ry,col,t:this.w.time,side:RAND()<.5?1:-1});this.w.decal(x,z,rr(.35,.6),[.32,0,0,.9]);}
  /* Gliedmaßen fliegen weg und bleiben liegen */
  limb(p,v,col){if(this.limbs.length>=70)this.limbs.shift();this.limbs.push({p:p.slice(),v:v.slice(),rot:[RAND()*6,RAND()*6,RAND()*6],w:[rr(-12,12),rr(-12,12),rr(-12,12)],col,rest:false});}
  /* Wache stürzt brennend von der Mauer */
  faller(p,out,col){const v=[out[0]*rr(1.5,3),rr(2.5,4.5),out[2]*rr(1.5,3)];this.fallers.push({p:p.slice(),v,rx:0,ry:angTo(out[0],out[2]),spin:rr(5,10),col});this.w.onScream&&this.w.onScream();}
  /* Krähen kommen zu Leichen und Ruinen */
  callCrows(x,z,n=4){for(let i=0;i<n&&this.crows.length<14;i++){const a=RAND()*6.28;this.crows.push({x:x+Math.cos(a)*14,y:rr(5,8),z:z+Math.sin(a)*14,cx:x,cz:z,state:'circle',t:-rr(0,2),ph:RAND()*6,ry:0});}
    this.w.onCaw&&this.w.onCaw();}

  update(dt){const w=this.w,t=w.time;
    if(t>this.nextSpawn){this.nextSpawn=t+8;if(this.folk.length<10&&w.castles.size){const kind=Object.keys(POP).find(k=>this.folk.filter(f=>f.kind===k).length<POP[k]);
      if(kind){const side=RAND()<.5?-1:1;this.add(kind,side*FIELD.x,rr(FIELD.z0,FIELD.z1));}}}
    // Bauern und Tiere: herumschlendern, bei Gefahr panisch weglaufen, Burgen ausweichen
    for(const f of this.folk){let sp=SPEED[f.kind],dx,dz;
      if(f.flee>0){f.flee-=dt;sp*=f.kind==='cow'?4:3.2;dx=f.fx;dz=f.fz;f.fx+=rr(-.4,.4)*dt*4;f.fz+=rr(-.4,.4)*dt*4;}
      else{dx=f.tx-f.x;dz=f.tz-f.z;const d=Math.hypot(dx,dz);if(d<.2){f.wait-=dt;sp=0;if(f.wait<=0){const a=RAND()*6.28,r=rr(1.5,4);let nx=f.x+Math.cos(a)*r,nz=f.z+Math.sin(a)*r;
        if(!this.free(nx,nz,2.4))[nx,nz]=this.spot();f.tx=nx;f.tz=nz;f.wait=rr(1,5);}}}
      if(sp>0){const l=Math.hypot(dx,dz)||1;let mx=dx/l*sp*dt,mz=dz/l*sp*dt;
        for(const c of w.castles.values()){const ox=f.x-c.x,oz=f.z-c.z,od=Math.hypot(ox,oz);if(od<2){mx+=ox/od*dt*2;mz+=oz/od*dt*2;}}
        f.x=clamp(f.x+mx,-FIELD.x-1,FIELD.x+1);f.z=clamp(f.z+mz,FIELD.z0-1,FIELD.z1+1);const tr=angTo(mx,mz);f.ry+=((tr-f.ry+Math.PI*3)%(Math.PI*2)-Math.PI)*Math.min(1,dt*8);f.moving=sp;}
      else f.moving=0;}
    // Krähen: kreisen, landen, picken
    for(const c of this.crows){c.t+=dt;
      if(c.state==='circle'){const a=t*.9+c.ph,r=1.6+Math.sin(c.ph)*.6,tx=c.cx+Math.cos(a)*r,tz=c.cz+Math.sin(a)*r,ty=3+Math.sin(c.ph*3)*.6;
        c.x=lerp(c.x,tx,Math.min(1,dt*1.5));c.z=lerp(c.z,tz,Math.min(1,dt*1.5));c.y=lerp(c.y,ty,Math.min(1,dt));c.ry=a-Math.PI;
        if(c.t>4+c.ph){const near=this.corpses.filter(k=>Math.hypot(k.x-c.cx,k.z-c.cz)<3);const k=near[Math.floor(RAND()*near.length)];
          c.lx=k?k.x+rr(-.2,.2):c.cx+rr(-.8,.8);c.lz=k?k.z+rr(-.2,.2):c.cz+rr(-.8,.8);c.state='land';c.t=0;}}
      else if(c.state==='land'){const gy=M.hgt(c.lx,c.lz)+.08;c.x=lerp(c.x,c.lx,Math.min(1,dt*2));c.z=lerp(c.z,c.lz,Math.min(1,dt*2));c.y=lerp(c.y,gy,Math.min(1,dt*2));
        if(Math.abs(c.y-gy)<.05){c.state='peck';c.t=0;}}
      else if(c.state==='peck'&&c.t>rr(6,14)){c.state='circle';c.t=0;}}
    // Vogelschwärme ziehen vorbei
    if(t>this.nextFlock){this.nextFlock=t+rr(14,30);const z=rr(-6,6),dir=RAND()<.5?1:-1;for(let i=0;i<6;i++)this.birds.push({x:-dir*24-i*.6*dir,y:rr(6,8),z:z+rr(-1.5,1.5),vx:dir*rr(3,3.6),ph:RAND()*6});}
    for(let i=this.birds.length-1;i>=0;i--){const b=this.birds[i];b.x+=b.vx*dt;b.y+=Math.sin(t*2+b.ph)*dt*.3;if(Math.abs(b.x)>26)this.birds.splice(i,1);}
    // Brennend abstürzende Wachen
    for(let i=this.fallers.length-1;i>=0;i--){const f=this.fallers[i];f.v[1]-=12*dt;f.p=v3.add(f.p,v3.scale(f.v,dt));f.rx+=f.spin*dt;
      w.spawn({x:f.p[0],y:f.p[1]+.15,z:f.p[2],vy:rr(.5,1.5),size:rr(.2,.4),col:[1,rr(.35,.6),.1,1],life:.35,drag:.95,g:1,type:0,add:true,grow:-.5});
      const gy=M.hgt(f.p[0],f.p[2]);if(f.p[1]<gy+.05){this.fallers.splice(i,1);const p=[f.p[0],gy+.1,f.p[2]];w.gore(p,f.col,1.1);this.corpse('guard',p[0],p[2],f.ry,f.col);
        w.emitters.push({x:p[0],y:gy+.05,z:p[2],fire:.45,t0:t,smoke:.3,dur:6});w.onSplat&&w.onSplat();}}
    // Gliedmaßen
    for(const l of this.limbs){if(l.rest)continue;l.v[1]-=14*dt;l.p=v3.add(l.p,v3.scale(l.v,dt));for(let k=0;k<3;k++)l.rot[k]+=l.w[k]*dt;
      if(RAND()<.5)w.spawn({x:l.p[0],y:l.p[1],z:l.p[2],vx:rr(-.3,.3),vy:rr(-.5,.2),vz:rr(-.3,.3),size:.07,col:[.5,0,0,1],life:.7,drag:.97,g:-9,type:1});
      const gy=M.hgt(l.p[0],l.p[2])+.03;if(l.p[1]<gy){l.p[1]=gy;l.v[1]*=-.25;l.v[0]*=.5;l.v[2]*=.5;l.w=l.w.map(x=>x*.4);if(Math.abs(l.v[1])<.5){l.rest=true;l.rot[0]=Math.PI/2;w.decal(l.p[0],l.p[2],rr(.12,.22),[.35,0,0,.9]);}}}
  }

  draw(add){const w=this.w,t=w.time,ms=w.mesh;
    for(const f of this.folk){const y=M.hgt(f.x,f.z),hop=f.moving?Math.abs(Math.sin(t*(f.flee>0?16:8)+f.ph))*(f.kind==='cow'?.02:.04):0,
        wob=f.moving?Math.sin(t*(f.flee>0?16:8)+f.ph)*.08:Math.sin(t*1.5+f.ph)*.03;
      add(ms[f.kind],m4.trs([f.x,y+hop,f.z],f.ry-Math.PI/2*(f.kind==='farmer'?0:1),0,wob,f.kind==='farmer'?1.6:1.5));}
    for(const k of this.corpses){const M4=k.kind==='guard'||k.kind==='farmer'?m4.trs([k.x,k.y+.05,k.z],k.ry,Math.PI/2*k.side,0,1.6):m4.trs([k.x,k.y+.1,k.z],k.ry,0,Math.PI/2*k.side,1.5);
      add(k.kind==='guard'?ms.guard:ms[k.kind],M4,k.col||[.6,.5,.4]);}
    for(const f of this.fallers)add(ms.guard,m4.trs(f.p,f.ry,f.rx,f.rx*.3,1.6),f.col);
    for(const l of this.limbs)add(ms.limb,m4.trs(l.p,l.rot[1],l.rot[0],l.rot[2],1.6),l.col||[1,1,1]);
    const bird=(x,y,z,ry,flap,s)=>{const B=m4.trs([x,y,z],ry,0,0,s);add(ms.crow,B);add(ms.crowWing,m4.mul(B,m4.trs([0,.02,.02],0,-flap,0)));add(ms.crowWing,m4.mul(B,m4.trs([0,.02,-.02],Math.PI,-flap,0)));};
    for(const c of this.crows){const fly=c.state!=='peck',flap=fly?Math.sin(t*14+c.ph)*.9:.1,peck=c.state==='peck'?Math.max(0,Math.sin(t*6+c.ph))*.5:0;
      const B=m4.trs([c.x,c.y,c.z],c.ry,0,-peck,1.5);add(ms.crow,B);add(ms.crowWing,m4.mul(B,m4.trs([0,.02,.02],0,-flap,0)));add(ms.crowWing,m4.mul(B,m4.trs([0,.02,-.02],Math.PI,-flap,0)));}
    for(const b of this.birds)bird(b.x,b.y,b.z,b.vx>0?0:Math.PI,Math.sin(t*10+b.ph)*.8,1.2);
  }
}
