// 3D-Welt von Königsfinger: Gelände, Burgen, Angriffe, Effekte, Kamera und Rendering (WebGL2).
import {m4,v3,clamp,lerp,smooth,hexRgb,program,meshVAO,target,freeTarget} from './gl.js';
import * as S from './shaders.js';
import * as M from './meshes.js';

const RAND=Math.random,rr=(a,b)=>a+RAND()*(b-a);
const easeBack=t=>{const c=1.70158;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);};

/* Tageszeit und Wetter – pro Partie wird eines zugelost */
export const PRESETS={
  tag:{name:'Sonniger Tag',zen:[.22,.42,.85],hor:[.78,.86,.95],gnd:[.3,.34,.3],sun:[.45,.78,.42],sunCol:[1.12,1.02,.88],sky:[.4,.48,.62],ground:[.24,.21,.17],fog:[.72,.8,.9],fogD:.009,stars:0,clouds:.55,moon:0,torch:0,grade:[1,1,1],sat:1.12,exp:1,pal:{grass:[.33,.55,.22],dirt:[.5,.4,.26],rock:[.52,.5,.48],leaf:[.22,.46,.18],leafD:[.14,.34,.14]}},
  abend:{name:'Sonnenuntergang',zen:[.16,.18,.42],hor:[1,.6,.38],gnd:[.25,.18,.18],sun:[.75,.22,.3],sunCol:[1.25,.82,.55],sky:[.42,.38,.52],ground:[.26,.18,.14],fog:[.7,.5,.46],fogD:.007,stars:.15,clouds:.6,moon:0,torch:.5,grade:[1.02,.97,.94],sat:1.05,exp:1,pal:{grass:[.34,.5,.24],dirt:[.5,.38,.25],rock:[.5,.45,.43],leaf:[.24,.4,.18],leafD:[.16,.3,.14]}},
  nacht:{name:'Vollmondnacht',zen:[.01,.02,.07],hor:[.07,.1,.2],gnd:[.03,.04,.06],sun:[-.35,.62,.3],sunCol:[.38,.46,.75],sky:[.1,.13,.25],ground:[.05,.05,.07],fog:[.05,.07,.14],fogD:.016,stars:1,clouds:.25,moon:1,torch:1.6,grade:[.95,1,1.12],sat:.95,exp:1.15,pal:{grass:[.22,.34,.22],dirt:[.32,.28,.22],rock:[.4,.4,.44],leaf:[.14,.26,.16],leafD:[.1,.2,.12]}},
  gewitter:{name:'Gewitter',zen:[.1,.11,.14],hor:[.32,.34,.38],gnd:[.15,.16,.16],sun:[.3,.85,.2],sunCol:[.55,.58,.68],sky:[.3,.32,.38],ground:[.14,.14,.14],fog:[.28,.3,.34],fogD:.02,stars:0,clouds:1,moon:0,torch:1,grade:[.95,.98,1.05],sat:.8,exp:1.1,weather:'regen',pal:{grass:[.26,.4,.22],dirt:[.36,.3,.22],rock:[.42,.42,.44],leaf:[.16,.3,.16],leafD:[.11,.22,.12]}},
  schnee:{name:'Wintersturm',zen:[.42,.5,.66],hor:[.78,.82,.88],gnd:[.6,.62,.66],sun:[.4,.6,.5],sunCol:[.85,.87,.95],sky:[.5,.54,.64],ground:[.35,.36,.4],fog:[.72,.76,.82],fogD:.011,stars:0,clouds:.9,moon:0,torch:.6,grade:[.98,1,1.05],sat:.9,exp:.82,weather:'schnee',pal:{grass:[.8,.82,.87],dirt:[.62,.64,.7],rock:[.5,.51,.55],leaf:[.2,.32,.24],leafD:[.78,.82,.88]}}};

export class World{
  constructor(canvas){
    this.cv=canvas;const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,depth:true,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
    if(!gl)throw new Error('WebGL2 nicht verfügbar');this.gl=gl;
    this.P={mesh:program(gl,S.MESH_VS,S.MESH_FS),inst:program(gl,S.MESH_VS,S.MESH_FS,'#define INST'),shadow:program(gl,S.MESH_VS,S.MESH_FS,'#define SHADOW'),
      shadowI:program(gl,S.MESH_VS,S.MESH_FS,'#define INST\n#define SHADOW'),sky:program(gl,S.QUAD_VS,S.SKY_FS),part:program(gl,S.PART_VS,S.PART_FS),
      decal:program(gl,S.DECAL_VS,S.DECAL_FS),down:program(gl,S.QUAD_VS,S.DOWN_FS),blur:program(gl,S.QUAD_VS,S.BLUR_FS),comp:program(gl,S.QUAD_VS,S.COMP_FS)};
    const m=d=>meshVAO(gl,d);
    this.mesh={core:m(M.castleCore()),tower:m(M.tower()),rubble:m(M.rubble()),ruin:m(M.keepRuin()),flag:m(M.flag()),guard:m(M.figure(false)),lord:m(M.figure(true)),
      ghost:m(M.ghost()),boulder:m(M.boulder()),keg:m(M.keg()),cat:m(M.catapult()),catArm:m(M.catapultArm()),dBody:m(M.dragonBody()),dHead:m(M.dragonHead()),
      dWing:m(M.dragonWing()),dTail:m(M.dragonTail()),crown:m(M.crown()),reticle:m(M.reticle()),shield:m(M.smoothSphere(1.75,2,5,[1,1,1])),
      cube:m(new M.MB().box(0,-.5,0,1,1,1,[1,1,1]).build())};
    this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    this.quadVao=gl.createVertexArray();gl.bindVertexArray(this.quadVao);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.bindVertexArray(null);
    // Instanz-Puffer: Trümmer (Würfel), Partikel, Flecken
    this.MAXC=900;this.chunkBuf=gl.createBuffer();this.chunkData=new Float32Array(this.MAXC*11);this.chunkVao=this._instVao(this.mesh.cube,this.chunkBuf);
    this.MAXP=9000;this.partBuf=gl.createBuffer();this.partData=new Float32Array(this.MAXP*12);
    this.partVao=gl.createVertexArray();gl.bindVertexArray(this.partVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.partBuf);gl.bufferData(gl.ARRAY_BUFFER,this.partData.byteLength,gl.DYNAMIC_DRAW);
    [[0,0],[1,16],[2,32]].forEach(([l,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,4,gl.FLOAT,false,48,o);gl.vertexAttribDivisor(l,1);});gl.bindVertexArray(null);
    this.MAXD=500;this.decBuf=gl.createBuffer();this.decData=new Float32Array(this.MAXD*10);
    const dq=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,dq);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]),gl.STATIC_DRAW);
    this.decVao=gl.createVertexArray();gl.bindVertexArray(this.decVao);gl.bindBuffer(gl.ARRAY_BUFFER,dq);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.decBuf);gl.bufferData(gl.ARRAY_BUFFER,this.decData.byteLength,gl.DYNAMIC_DRAW);
    [[1,4,0],[2,4,16],[3,2,32]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,40,o);gl.vertexAttribDivisor(l,1);});gl.bindVertexArray(null);
    this.SH=2048;this.shadowT=target(gl,this.SH,this.SH,{depthTex:true,color:false});
    this.samples=Math.min(4,gl.getParameter(gl.MAX_SAMPLES)||0);
    this.time=0;this.castles=new Map();this.parts=[];this.chunks=[];this.decals=[];this.anims=[];this.lights=[];this.emitters=[];this.objs=[];
    this.shake=0;this.flash=[1,1,1,0];this.chroma=0;this.effects=true;this.dark=0;this.q=1;this.lightning=0;
    this.cam={eye:[0,18,15],tgt:[0,0,0],fov:.75,focus:null,focusAmt:0,orbit:null,title:true};
    this.reticleAt=null;this.reticleCol=[1,.2,.1];
    this.setPreset('tag');this.resize();
  }
  _instVao(mesh,buf){const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buf);
    [[0,3,0],[1,3,12],[2,3,24],[3,1,36]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,40,o);});
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,this.chunkData.byteLength,gl.DYNAMIC_DRAW);
    [[4,4,0],[5,4,16],[6,3,32]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,44,o);gl.vertexAttribDivisor(l,1);});gl.bindVertexArray(null);return vao;}

  /* ---------- Umgebung ---------- */
  setPreset(key){if(key===this.presetKey&&this.terrainM)return;this.preset=PRESETS[key]||PRESETS.tag;this.presetKey=key;const gl=this.gl,p=this.preset;
    if(this.terrainM){gl.deleteBuffer(this.terrainM.buf);gl.deleteBuffer(this.forestM.buf);}
    this.terrainM=meshVAO(gl,M.terrain(p.pal));this.forestM=meshVAO(gl,M.forest(p.pal,(x,z)=>Math.abs(x)<10.5&&z>-9&&z<11));
    this.weather=p.weather||null;this.nextBolt=this.time+rr(4,9);}
  resize(){const dpr=Math.min(window.devicePixelRatio||1,2.5),w=Math.max(1,this.cv.clientWidth||innerWidth),h=Math.max(1,this.cv.clientHeight||innerHeight);
    this.W=w;this.H=h;const px=Math.min(1,Math.sqrt(2.6e6/(w*h*dpr*dpr)))*this.q;
    const bw=Math.max(32,Math.round(w*dpr*px)),bh=Math.max(32,Math.round(h*dpr*px));if(bw===this.bw&&bh===this.bh)return;
    this.bw=bw;this.bh=bh;this.cv.width=bw;this.cv.height=bh;const gl=this.gl;
    [this.msT,this.sT,this.b1,this.b1t,this.b2,this.b2t].forEach(t=>freeTarget(gl,t));
    this.msT=this.samples?target(gl,bw,bh,{msaa:this.samples}):target(gl,bw,bh,{depthTex:true});this.sT=target(gl,bw,bh);
    const w4=Math.max(8,bw>>2),h4=Math.max(8,bh>>2),w8=Math.max(4,bw>>3),h8=Math.max(4,bh>>3);
    this.b1=target(gl,w4,h4);this.b1t=target(gl,w4,h4);this.b2=target(gl,w8,h8);this.b2t=target(gl,w8,h8);
    // Grundkamera: Spielfeld passt in Hoch- wie Querformat
    const a=w/h;this.baseEye=a<1?[0,21,16.5]:[0,15.5,13];this.baseTgt=a<1?[0,0,1.2]:[0,0,.6];this.baseFov=a<1?.78:.72;if(this.fitPts)this.fitCamera(this.fitPts);}

  /* ---------- Kamera ---------- */
  viewProj(){const c=this.cam;let eye=this.baseEye.slice(),tgt=this.baseTgt.slice(),fov=this.baseFov;
    if(this.fit){const k=smooth(clamp((this.time-this.fit.t0)/1.2,0,1));eye=v3.lerp(this.fit.e0||eye,this.fit.eye,k);tgt=v3.lerp(this.fit.g0||tgt,this.fit.tgt,k);}
    if(c.title){const a=this.time*.08;eye=[Math.sin(a)*22,13,Math.cos(a)*22];tgt=[0,0,0];fov=.7;}
    if(c.orbit){const o=c.orbit,a=o.a0+this.time*.35-o.t0*.35,k=smooth(clamp((this.time-o.t0)/1.5,0,1));
      const oe=[o.x+Math.sin(a)*7,o.y+4.2,o.z+Math.cos(a)*7],ot=[o.x,o.y+1.2,o.z];eye=v3.lerp(eye,oe,k);tgt=v3.lerp(tgt,ot,k);fov=lerp(fov,.7,k);}
    if(c.focus&&c.focusAmt>0&&this.effects){const f=c.focus,k=c.focusAmt;tgt=v3.lerp(tgt,f,k*.45);eye=v3.lerp(eye,v3.add(f,v3.scale(v3.norm(v3.sub(eye,tgt)),13)),k*.35);}
    if(this.shake>0&&this.effects){const s=this.shake*.04;eye=v3.add(eye,[rr(-s,s),rr(-s,s),rr(-s,s)]);tgt=v3.add(tgt,[rr(-s,s)*.5,rr(-s,s)*.5,0]);}
    this.eye=eye;this._tgt=tgt;const V=m4.lookAt(eye,tgt,[0,1,0]),P=m4.persp(fov,this.W/this.H,.3,220);this.V=V;this.VP=m4.mul(P,V);this.invVP=m4.inv(this.VP);return this.VP;}
  /* Kamera so weit zurückziehen, dass alle Punkte (x,z) samt Burghöhe mit Rand ins Bild passen */
  fitCamera(pts,margin=.1){this.fitPts=pts;if(!pts||!pts.length){this.fit=null;return;}const prev=this.fit&&this.eye?[this.eye.slice(),this._tgt||this.baseTgt]:null;
    let cx=0,cz=0;pts.forEach(p=>{cx+=p.x;cz+=p.z;});cx/=pts.length;cz/=pts.length;
    const dir=v3.norm(v3.sub(this.baseEye,this.baseTgt)),tgt=[cx,0,cz+(this.W<this.H?.6:.3)],P=m4.persp(this.baseFov,this.W/this.H,.3,220);
    const ok=d=>{const e=v3.add(tgt,v3.scale(dir,d)),VP=m4.mul(P,m4.lookAt(e,tgt,[0,1,0]));
      for(const p of pts)for(const y of [0,2.6])for(const [ox,oz] of [[-1.5,-1.5],[1.5,1.5],[1.5,-1.5],[-1.5,1.5]]){const c=m4.xform(VP,[p.x+ox,M.hgt(p.x,p.z)+y,p.z+oz]);
        if(Math.abs(c[0])>1-margin||c[1]>1-margin*2.4||c[1]<-1+margin*1.2)return false;}return true;};
    let lo=8,hi=60;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(ok(m))hi=m;else lo=m;}
    const d=Math.max(hi,v3.len(v3.sub(this.baseEye,this.baseTgt))*.72);
    this.fit={eye:v3.add(tgt,v3.scale(dir,d)),tgt,t0:this.time,e0:prev?prev[0]:this.baseEye.slice(),g0:prev?prev[1]:this.baseTgt.slice()};}
  /* Burg unter einem Fingertipp (Bildschirmabstand zur Burgmitte) */
  pickCastle(px,py,ids){let best=null,bd=Math.max(56,Math.min(this.W,this.H)*.13);this.viewProj();
    for(const c of this.castles.values()){if(ids&&!ids.includes(c.id))continue;const q=this.project([c.x,c.y+.7,c.z]),d=Math.hypot(q.x-px,q.y-py);if(d<bd){bd=d;best=c.id;}}return best;}
  /* Farbe und Wappen zugelost: Burg färbt sich mit einem Funkenregen um */
  paint(id,hex){const c=this.castles.get(id);if(!c)return;const col=hexRgb(hex),from=c.col.slice();
    this.tween(.8,k=>{c.col=v3.lerp(from,col,smooth(k));},null);
    this.burst([c.x,c.y+1.8,c.z],{n:90,col,speed:5,type:2,life:1,add:true,size:.07,g:-6});this.light([c.x,c.y+2,c.z],col,10,.6);}
  screenToGround(px,py){this.viewProj();const nx=px/this.W*2-1,ny=1-py/this.H*2,a=m4.xform(this.invVP,[nx,ny,-1]),b=m4.xform(this.invVP,[nx,ny,1]);
    const d=v3.sub(b,a);if(Math.abs(d[1])<1e-6)return null;const t=-a[1]/d[1];if(t<0)return null;return {x:a[0]+d[0]*t,z:a[2]+d[2]*t};}
  project(p){const c=m4.xform(this.VP,p);return {x:(c[0]*.5+.5)*this.W,y:(.5-c[1]*.5)*this.H,vis:c[2]<1&&c[2]>-1};}
  /* Darf hier gebaut werden? Innerhalb des sichtbaren Bereichs und mit Abstand zu anderen Burgen */
  canPlace(x,z,px,py,region=null){if(region){if(Math.abs(x)>region.x||z<region.z0||z>region.z1)return 'rand';}
    else if(px<this.W*.1||px>this.W*.9||py<this.H*.2||py>this.H*.86)return 'rand';
    for(const c of this.castles.values())if(Math.hypot(c.x-x,c.z-z)<3.1)return 'nah';return '';}

  /* ---------- Burgen ---------- */
  addCastle(id,x,z,color){const y=M.hgt(x,z),c={id,x,y,z,col:hexRgb(color),t0:this.time,grow:0,towers:[0,1,2].map(i=>({up:true,fall:-1})),
      guards:[],lord:true,lordFall:-1,fallen:false,fallT:-1,shield:false,shieldA:0,glow:0,ghost:false,ghostT:0,crown:null,torch:true};
    for(let w=0;w<3;w++){const a=M.towerPos(w),b=M.towerPos((w+1)%3);for(const t of [.3,.7]){const gx=lerp(a[0],b[0],t),gz=lerp(a[2],b[2],t);
      c.guards.push({x:gx,z:gz,ry:Math.atan2(gx,gz),tower:t<.5?w:(w+1)%3,alive:true,ph:RAND()*6});}}
    this.castles.set(id,c);
    for(let i=0;i<60;i++)this.spawn({x:x+rr(-1.4,1.4),y:y+.1,z:z+rr(-1.4,1.4),vx:rr(-1,1),vy:rr(.5,2),vz:rr(-1,1),size:rr(.4,.9),col:[...this.preset.pal.dirt,.55],life:rr(.8,1.6),drag:.9,g:-.3,grow:1.2,type:0});
    return new Promise(r=>this.after(1.7,r));}
  /* Burg sofort im aktuellen Zustand hinstellen (Online-Nachzügler) */
  restore(id,x,z,color,towers,alive,shield){this.addCastle(id,x,z,color);const c=this.castles.get(id);c.t0=-99;
    c.towers.forEach((t,i)=>{t.up=alive&&i<towers;t.fall=-99;});c.guards.forEach(g=>{g.alive=c.towers[g.tower].up;});
    if(!alive){c.fallen=true;c.lord=false;c.torch=false;c.ghost=true;c.ghostT=-99;}c.shield=!!shield&&alive;}
  clearCastles(){this.fit=null;this.fitPts=null;this.fireworks=null;this.objs.length=0;this.lights.length=0;this.castles.clear();this.chunks.length=0;this.decals.length=0;this.emitters.length=0;this.parts.length=0;this.anims.length=0;this.cam.orbit=null;this.reticleAt=null;this.dark=0;}
  castle(id){return this.castles.get(id);}
  cpos(id,dy=0){const c=this.castles.get(id);return [c.x,c.y+dy,c.z];}
  setShield(id,on){const c=this.castles.get(id);if(c){c.shield=on;if(on)c.glow=1;}}

  /* Ein Turm wird getroffen. blocked: Schild fängt ab. Liefert den Index des zerstörten Turms. */
  hitTower(id,blocked,kind='stein'){const c=this.castles.get(id);if(!c)return -1;const p=[c.x,c.y,c.z];
    if(blocked){c.glow=2.5;this.burst(v3.add(p,[0,1.2,0]),{n:120,col:[1,.9,.5],speed:9,type:2,life:.6,add:true,size:.12});this.light(v3.add(p,[0,2,0]),[1,.85,.4],12,.5);this.kick(.6);return -1;}
    const alive=c.towers.map((t,i)=>t.up?i:-1).filter(i=>i>=0);if(!alive.length)return -1;
    const i=alive[Math.floor(RAND()*alive.length)],t=c.towers[i];t.up=false;t.fall=this.time;
    const tp=v3.add(p,M.towerPos(i));
    this.explosion(v3.add(tp,[0,.8,0]),kind==='fluch'?[.7,.3,1]:[1,.55,.2],1.1);
    for(let k=0;k<26;k++)this.chunk(v3.add(tp,[rr(-.3,.3),rr(.2,1.4),rr(-.3,.3)]),[rr(-5,5),rr(3,9),rr(-5,5)],rr(.08,.2),RAND()<.8?M.C.stone:M.C.stoneD);
    this.emitters.push({x:tp[0],y:tp[1]+.35,z:tp[2],fire:1,t0:this.time,smoke:1});
    // Wachen an diesem Turm sterben – Gore
    for(const g of c.guards)if(g.alive&&g.tower===i){g.alive=false;this.gore([c.x+g.x,c.y+M.BASE_Y+.6,c.z+g.z],c.col,1);}
    this.kick(1);return i;}
  /* Burg fällt: Bergfried bricht, Burgherr stirbt, Blutbad, Ruine mit Geist */
  fallCastle(id){const c=this.castles.get(id);if(!c)return;c.fallen=true;c.fallT=this.time;c.shield=false;c.torch=false;const p=[c.x,c.y,c.z];
    for(const t of c.towers)if(t.up){t.up=false;t.fall=this.time;}
    this.explosion(v3.add(p,[0,1,0]),[1,.4,.15],2);
    for(let k=0;k<70;k++)this.chunk(v3.add(p,[rr(-.5,.5),rr(.3,1.4),rr(-.5,.5)]),[rr(-7,7),rr(4,12),rr(-7,7)],rr(.1,.26),RAND()<.7?M.C.stoneL:M.C.stoneD);
    for(const g of c.guards)if(g.alive){g.alive=false;this.gore([c.x+g.x,c.y+M.BASE_Y+.6,c.z+g.z],c.col,1);}
    c.lord=false;this.gore(v3.add(p,[0,M.BASE_Y+1.2,0]),c.col,2.4);
    for(let k=0;k<6;k++)this.decal(c.x+rr(-1.4,1.4),c.z+rr(-1.4,1.4),rr(.6,1.3),[.35,.01,.01,.9]);
    this.emitters.push({x:c.x,y:c.y+.6,z:c.z,fire:1.6,t0:this.time,smoke:2});
    this.after(1.6,()=>{c.ghost=true;c.ghostT=this.time;});this.kick(2);}
  /* Stechen: Burg steht mit einem Turm wieder auf */
  revive(id){const c=this.castles.get(id);if(!c)return;c.fallen=false;c.ghost=false;c.lord=true;c.torch=true;c.towers.forEach((t,i)=>{t.up=i===0;t.fall=-1;});
    this.emitters=this.emitters.filter(e=>Math.hypot(e.x-c.x,e.z-c.z)>2);
    for(let i=0;i<50;i++)this.spawn({x:c.x+rr(-1.3,1.3),y:c.y+.2,z:c.z+rr(-1.3,1.3),vx:0,vy:rr(1,3),vz:0,size:rr(.2,.4),col:[1,.9,.5,1],life:rr(.6,1.2),drag:.95,g:0,type:0,add:true});}

  /* ---------- Partikel, Trümmer, Flecken, Licht ---------- */
  spawn(p){if(this.parts.length>=this.MAXP)this.parts.shift();p.age=0;p.vx=p.vx||0;p.vy=p.vy||0;p.vz=p.vz||0;this.parts.push(p);return p;}
  burst(pos,{n=40,col=[1,1,1],speed=5,type=0,life=1,add=false,size=.2,g=-9,drag=.94,up=0,alpha=1}={}){
    for(let i=0;i<n;i++){const a=RAND()*6.2832,b=Math.acos(rr(-1,1)),s=speed*(.3+RAND()*.7);
      this.spawn({x:pos[0],y:pos[1],z:pos[2],vx:Math.sin(b)*Math.cos(a)*s,vy:Math.cos(b)*s+up,vz:Math.sin(b)*Math.sin(a)*s,size:size*(.6+RAND()*.8),col:[col[0],col[1],col[2],alpha],life:life*(.5+RAND()*.7),drag,g,type,add});}}
  chunk(p,v,s,col){if(this.chunks.length>=this.MAXC)this.chunks.shift();const ax=v3.norm([rr(-1,1),rr(-1,1),rr(-1,1)]);
    this.chunks.push({p:p.slice(),v:v.slice(),s,col,ax,ang:RAND()*6,w:rr(4,14),rest:false,blood:false});}
  decal(x,z,size,col){if(this.decals.length>=this.MAXD)this.decals.shift();this.decals.push({x,z,y:M.hgt(x,z)+.03+this.decals.length*.00004,size,col,rot:RAND()*6.28,seed:RAND()*100});}
  light(p,col,int,dur){this.lights.push({p,col,int,t0:this.time,dur});}
  kick(k){if(!this.effects)k*=.25;this.shake=Math.max(this.shake,k*.9);this.chroma=Math.max(this.chroma,k*.004);}
  explosion(p,col,s=1){this.burst(p,{n:Math.round(140*s),col,speed:8*s,type:0,life:.9,add:true,size:.55*s,g:2,drag:.9});
    this.burst(p,{n:Math.round(90*s),col:[1,.85,.5],speed:14*s,type:2,life:.7,add:true,size:.07,g:-12,drag:.97});
    this.burst(p,{n:Math.round(60*s),col:[.18,.16,.15],speed:3*s,type:0,life:2.6,size:1.1*s,g:.8,drag:.94,alpha:.75});
    this.light(p,col,30*s,.6);this.flash=[col[0],col[1],col[2],Math.min(.6,.25*s)];this.decal(p[0],p[2],.65*s,[.12,.09,.07,.5]);}
  /* Ultra-Gore: Blutfontäne, Fleischbrocken, Knochen, Blutlachen */
  gore(p,tint,s=1){
    this.burst(p,{n:Math.round(220*s),col:[.55,0,0],speed:5*s,type:1,life:1.4,size:.11,g:-14,drag:.97,up:2});
    this.burst(p,{n:Math.round(80*s),col:[.35,0,0],speed:3*s,type:0,life:1,size:.35,g:-4,drag:.9,alpha:.8});
    for(let k=0;k<Math.round(14*s);k++){const r=RAND();this.chunk(p,[rr(-5,5),rr(3,10),rr(-5,5)],rr(.04,.11),r<.45?[.6,.05,.04]:r<.7?[.8,.35,.28]:r<.85?[.92,.9,.84]:tint);this.chunks[this.chunks.length-1].blood=true;}
    for(let k=0;k<Math.round(4*s);k++)this.decal(p[0]+rr(-.8,.8)*s,p[2]+rr(-.8,.8)*s,rr(.25,.55)*s,[.4,.01,.01,.92]);}

  /* ---------- Zeitsteuerung ---------- */
  after(t,fn){this.anims.push({t0:this.time,dur:t,step:null,done:fn});}
  tween(dur,step,done){this.anims.push({t0:this.time,dur,step,done});}
  wait(t){return new Promise(r=>this.after(t,r));}

  /* ---------- Fadenkreuz ---------- */
  setReticle(id,col){if(id==null){this.reticleAt=null;return;}const c=this.castles.get(id);if(!c)return;this.reticleAt=[c.x,c.y+.04,c.z];this.reticleT=this.time;if(col)this.reticleCol=col;}

  /* ---------- Angriffe (Promises lösen beim Einschlag aus) ---------- */
  catapult(id){return new Promise(res=>{const c=this.castles.get(id),dst=[c.x,c.y+1,c.z],side=c.x>0?-1:1;
    const base=[side*rr(5,9),0,-15.5];base[1]=M.hgt(base[0],base[2]);const cat={type:'cat',p:base,ry:Math.atan2(dst[0]-base[0],dst[2]-base[2])-Math.PI/2,arm:-.9};this.objs.push(cat);
    this.tween(.45,k=>{cat.arm=lerp(-.9,1.1,k*k);},()=>{
      const from=v3.add(base,[0,1.4,0]),rock={type:'boulder',p:from.slice(),rot:0};this.objs.push(rock);const T=1.35;
      this.tween(T,k=>{rock.p=v3.lerp(from,dst,k);rock.p[1]+=Math.sin(k*Math.PI)*9;rock.rot=k*12;
        if(RAND()<.7)this.spawn({x:rock.p[0],y:rock.p[1],z:rock.p[2],vx:rr(-.3,.3),vy:rr(-.3,.3),vz:rr(-.3,.3),size:rr(.3,.6),col:[.35,.32,.3,.6],life:1.2,drag:.95,g:.4,grow:1.5,type:0});
        if(this.effects)this.cam.focus=rock.p,this.cam.focusAmt=k*.6;},
      ()=>{this.objs=this.objs.filter(o=>o!==rock);this.cam.focusAmt=0;this.burst(dst,{n:60,col:[.5,.42,.32],speed:6,type:0,life:1.4,size:.6,g:.5,drag:.9,alpha:.8});
        this.after(2,()=>{this.objs=this.objs.filter(o=>o!==cat);});res();});});});}
  keg(id){return new Promise(res=>{const c=this.castles.get(id),land=[c.x+rr(-.3,.3),c.y+.25,c.z+1.15],from=v3.add(land,[rr(-3,3),14,-4]);
    const k={type:'keg',p:from.slice(),rot:0};this.objs.push(k);
    this.tween(.9,t=>{k.p=v3.lerp(from,land,t*t);k.rot=t*8;},()=>{this.burst(land,{n:30,col:[.5,.42,.32],speed:3,type:0,life:1,size:.4,g:.3,alpha:.7});this.kick(.4);
      let fuse=0;this.tween(1.1,t=>{fuse+=1;if(fuse%2===0)this.burst(v3.add(k.p,[0,.4,0]),{n:4,col:[1,.8,.3],speed:2.5,type:2,life:.3,add:true,size:.05,g:-4});k.p[1]=land[1]+Math.abs(Math.sin(t*30))*.03;
        if(this.effects)this.cam.focus=land,this.cam.focusAmt=t*.7;},()=>{this.objs=this.objs.filter(o=>o!==k);this.cam.focusAmt=0;
        // BUMM – Pulverfass: großer Feuerball, Druckwelle, Brandfleck
        this.explosion(v3.add(land,[0,.4,0]),[1,.5,.12],2.2);this.burst(land,{n:160,col:[1,.7,.25],speed:18,type:2,life:.5,add:true,size:.09,g:-6,drag:.95});
        for(let a=0;a<36;a++){const ang=a/36*6.2832;this.spawn({x:land[0],y:land[1]+.2,z:land[2],vx:Math.cos(ang)*14,vy:.4,vz:Math.sin(ang)*14,size:1.2,col:[.6,.55,.5,.5],life:.7,drag:.9,g:0,type:0});}
        this.decal(land[0],land[2],1.3,[.1,.08,.06,.6]);this.kick(2.2);res();});});});}
  chain(fromId,toId){return new Promise(res=>{const a=this.castles.get(fromId),b=this.castles.get(toId),from=[a.x,a.y+1.2,a.z],to=[b.x,b.y+1,b.z];
    const f={type:'keg',p:from.slice(),rot:0};this.objs.push(f);
    this.tween(1,t=>{f.p=v3.lerp(from,to,t);f.p[1]+=Math.sin(t*Math.PI)*5;f.rot=t*14;this.burst(f.p,{n:3,col:[1,.5,.1],speed:1,type:0,life:.5,add:true,size:.5,g:1});},
      ()=>{this.objs=this.objs.filter(o=>o!==f);this.explosion(to,[1,.5,.12],1.8);this.kick(1.6);res();});});}
  /* Drache: fliegt entlang der Linie, speit Feuer auf jede getroffene Burg */
  dragon(anchorId,dir,hitIds,onBurn){return new Promise(res=>{const a=this.castles.get(anchorId),d=[Math.cos(dir),0,Math.sin(dir)],L=30;
    const s=[a.x-d[0]*L/2,4.2,a.z-d[2]*L/2],e=[a.x+d[0]*L/2,4.2,a.z+d[2]*L/2],drg={type:'dragon',p:s.slice(),ry:Math.atan2(d[0],d[2]),flap:0,breath:false};this.objs.push(drg);
    const burned=new Set(),T=4.2;
    this.tween(T,k=>{drg.p=v3.lerp(s,e,k);drg.p[1]=4.2+Math.sin(k*Math.PI*2)*.4;drg.flap=this.time*7;drg.breath=false;
      for(const id of hitIds){const c=this.castles.get(id);const t=((c.x-s[0])*d[0]+(c.z-s[2])*d[2])/L;
        if(Math.abs(k-t)<.08){drg.breath=true;const mouth=v3.add(drg.p,[d[0]*1.2,-.3,d[2]*1.2]);
          for(let i=0;i<10;i++)this.spawn({x:mouth[0],y:mouth[1],z:mouth[2],vx:(c.x-mouth[0])*rr(1.2,1.8)+rr(-.6,.6),vy:(c.y+.8-mouth[1])*rr(1.2,1.8),vz:(c.z-mouth[2])*rr(1.2,1.8)+rr(-.6,.6),size:rr(.4,.9),col:[1,rr(.3,.6),.08,1],life:rr(.4,.7),drag:.96,g:1,type:0,add:true,grow:1.6});
          this.light(v3.add([c.x,c.y,c.z],[0,1.5,0]),[1,.5,.15],10,.2);
          if(!burned.has(id)&&k>t){burned.add(id);onBurn&&onBurn(id);}}}
      if(this.effects)this.cam.focus=drg.p,this.cam.focusAmt=.35;},
      ()=>{for(const id of hitIds)if(!burned.has(id)){burned.add(id);onBurn&&onBurn(id);}this.objs=this.objs.filter(o=>o!==drg);this.cam.focusAmt=0;res();});});}
  /* Fluch: Himmel verdunkelt sich, violetter Blitz in den Bergfried */
  curse(id){return new Promise(res=>{const c=this.castles.get(id),top=[c.x,c.y+1.4,c.z];
    this.tween(1.4,k=>{this.dark=k*.7;for(let i=0;i<3;i++){const a=RAND()*6.28,r=rr(1.5,3.5);this.spawn({x:c.x+Math.cos(a)*r,y:c.y+rr(4,7),z:c.z+Math.sin(a)*r,vx:-Math.sin(a)*3,vy:-.4,vz:Math.cos(a)*3,size:rr(.6,1.2),col:[.45,.1,.7,.7],life:1,drag:.97,g:0,type:0});}
      if(this.effects)this.cam.focus=top,this.cam.focusAmt=k*.5;},()=>{
      let p=[c.x+rr(-1,1),c.y+16,c.z+rr(-1,1)];const n=18;for(let i=0;i<n;i++){const q=v3.lerp(p,top,1/(n-i));q[0]+=rr(-.5,.5)*(n-i)/n;q[2]+=rr(-.5,.5)*(n-i)/n;
        const segs=8;for(let s=0;s<segs;s++){const m=v3.lerp(p,q,s/segs);this.spawn({x:m[0],y:m[1],z:m[2],size:.35,col:[.85,.6,1,1],life:.35,type:0,add:true,g:0,drag:1});this.spawn({x:m[0],y:m[1],z:m[2],size:1.1,col:[.5,.15,1,.6],life:.45,type:0,add:true,g:0,drag:1});}p=q;}
      this.light(top,[.7,.3,1],45,.7);this.flash=[.8,.6,1,.7];this.burst(top,{n:160,col:[.7,.3,1],speed:10,type:2,life:.7,add:true,size:.08,g:-8});
      this.kick(1.8);this.cam.focusAmt=0;this.tween(1.2,k=>{this.dark=.7*(1-k);},null);res();});});}

  /* Krönung: Krone senkt sich auf den Burgherrn, Lichtsäule, Feuerwerk, Kamera kreist */
  coronation(id){const c=this.castles.get(id);if(!c)return;c.crown={t0:this.time};this.cam.orbit={x:c.x,y:c.y,z:c.z,t0:this.time,a0:0};this.fireworks=id;this.nextFw=this.time+.8;
    this.light([c.x,c.y+3,c.z],[1,.85,.4],25,4);}
  stopCoronation(){this.fireworks=null;this.cam.orbit=null;}
  setTitle(on){this.cam.title=on;}

  /* ---------- Simulation ---------- */
  update(dt){this.time+=dt;const t=this.time;
    for(let i=this.anims.length-1;i>=0;i--){const a=this.anims[i],k=clamp((t-a.t0)/a.dur,0,1);if(a.step)a.step(k);if(k>=1){this.anims.splice(i,1);a.done&&a.done();}}
    this.shake=Math.max(0,this.shake-dt*2.2);this.chroma*=Math.pow(.02,dt);this.flash[3]*=Math.pow(.02,dt);this.lightning*=Math.pow(.001,dt);
    for(const c of this.castles.values()){c.glow=Math.max(0,c.glow-dt*1.6);c.shieldA=lerp(c.shieldA,c.shield?1:0,1-Math.pow(.08,dt));}
    // Partikel
    for(let i=this.parts.length-1;i>=0;i--){const p=this.parts[i];p.age+=dt;if(p.age>=p.life){this.parts.splice(i,1);continue;}
      const dr=Math.pow(p.drag??.95,dt*60);p.vx*=dr;p.vy*=dr;p.vz*=dr;p.vy+=(p.g||0)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      if(p.type===1&&p.y<M.hgt(p.x,p.z)){if(RAND()<.1)this.decal(p.x,p.z,rr(.05,.12),[.3,.0,.0,.85]);this.parts.splice(i,1);}}
    // Trümmer mit einfacher Physik
    for(const c of this.chunks){if(c.rest)continue;c.v[1]-=16*dt;c.p=v3.add(c.p,v3.scale(c.v,dt));c.ang+=c.w*dt;const gy=M.hgt(c.p[0],c.p[2])+c.s*.5;
      if(c.p[1]<gy){c.p[1]=gy;if(c.blood&&Math.abs(c.v[1])>2)this.decal(c.p[0],c.p[2],rr(.12,.28),[.4,.01,.01,.9]);c.v[1]*=-.3;c.v[0]*=.6;c.v[2]*=.6;c.w*=.5;if(Math.abs(c.v[1])<.6&&Math.hypot(c.v[0],c.v[2])<.4)c.rest=true;}}
    // Feuer an zerstörten Türmen
    for(const e of this.emitters){const age=t-e.t0,f=e.fire*Math.max(.35,1-age/40);
      if(RAND()<f*.9)this.spawn({x:e.x+rr(-.25,.25),y:e.y,z:e.z+rr(-.25,.25),vy:rr(1,2.2),size:rr(.25,.55)*f,col:[1,rr(.35,.6),.1,1],life:rr(.4,.8),drag:.97,g:.6,type:0,add:true,grow:-.6});
      if(RAND()<.35*e.smoke)this.spawn({x:e.x+rr(-.3,.3),y:e.y+.6,z:e.z+rr(-.3,.3),vx:rr(-.1,.3),vy:rr(.8,1.4),vz:rr(-.1,.1),size:rr(.5,.9),col:[.12,.11,.1,.55],life:rr(2.5,4),drag:.98,g:.15,type:0,grow:1.4});}
    // Wetter
    if(this.weather==='regen'){for(let i=0;i<14;i++){const x=rr(-16,16),z=rr(-12,14);this.spawn({x,y:14,z,vx:-2,vy:-24,vz:0,size:.03,col:[.65,.7,.8,.5],life:.7,drag:1,g:0,type:2});}
      if(t>this.nextBolt){this.nextBolt=t+rr(5,12);this.lightning=1;this.flash=[.85,.9,1,.55];this.onThunder&&this.onThunder();}}
    if(this.weather==='schnee')for(let i=0;i<6;i++)this.spawn({x:rr(-16,16),y:12,z:rr(-12,14),vx:rr(-1.5,-.3),vy:rr(-1.6,-.9),vz:rr(-.3,.3),size:rr(.06,.12),col:[1,1,1,.85],life:10,drag:1,g:0,type:1});
    // Feuerwerk bei der Krönung
    if(this.fireworks!=null&&t>this.nextFw){this.nextFw=t+rr(.35,.8);const c=this.castles.get(this.fireworks),pos=[c.x+rr(-4,4),c.y+rr(6,10),c.z+rr(-4,3)],col=[[1,.3,.3],[1,.85,.3],[.3,.8,1],[.6,1,.4],[1,.4,.9]][Math.floor(RAND()*5)];
      this.burst(pos,{n:140,col,speed:7,type:2,life:1.6,add:true,size:.07,g:-3,drag:.96});this.light(pos,col,15,.5);this.onFirework&&this.onFirework();}
  }

  /* ---------- Rendern ---------- */
  render(){const gl=this.gl,p=this.preset,t=this.time;const VP=this.viewProj();
    const dk=1-this.dark,sunDir=v3.norm(p.sun),sunCol=v3.scale(p.sunCol,dk+this.lightning*.6);
    // Licht der Feuer, Explosionen und Fackeln – die 8 hellsten
    const L=[];for(let i=this.lights.length-1;i>=0;i--){const l=this.lights[i],k=(t-l.t0)/l.dur;if(k>=1){this.lights.splice(i,1);continue;}L.push([l.p,l.col,l.int*(1-k)]);}
    for(const e of this.emitters)L.push([[e.x,e.y+.5,e.z],[1,.5,.15],3.5*e.fire*(.8+.4*Math.sin(t*17+e.x))]);
    if(p.torch>0)for(const c of this.castles.values())if(c.torch&&!c.fallen)L.push([[c.x,c.y+.9,c.z+1.3],[1,.6,.25],p.torch*2.2*(.85+.15*Math.sin(t*13+c.x))]);
    L.sort((a,b)=>b[2]-a[2]);const NL=Math.min(8,L.length),LP=new Float32Array(32),LC=new Float32Array(24);
    for(let i=0;i<NL;i++){LP.set([...L[i][0],L[i][2]],i*4);LC.set(L[i][1],i*3);}
    // Zeichenliste aufbauen
    const D=[];const add=(mesh,M4,tint=[1,1,1],alpha=1,glow=0,tr=false)=>D.push({mesh,M:M4,tint,alpha,glow,tr});
    for(const c of this.castles.values()){const g=clamp((t-c.t0)/1.4,0,1),sy=g<1?Math.max(.01,easeBack(g)):1,base=m4.trs([c.x,c.y,c.z],0,0,0,[1,sy,1]);
      const T=l=>m4.mul(base,l);
      add(c.fallen?this.mesh.ruin:this.mesh.core,T(m4.ident()),c.col);
      c.towers.forEach((tw,i)=>{const tp=M.towerPos(i);
        if(tw.up)add(this.mesh.tower,T(m4.trs(tp)),c.col);
        else{const k=clamp((t-tw.fall)/.7,0,1);if(k<1)add(this.mesh.tower,T(m4.trs([tp[0],tp[1]-k*1.2,tp[2]],0,k*.8,k*.5,[1,1-k*.6,1])),c.col);else add(this.mesh.rubble,T(m4.trs(tp)),c.col);}});
      if(!c.fallen){add(this.mesh.flag,T(m4.trs([.32,M.BASE_Y+1.9,-.3])),c.col);
        for(const gd of c.guards)if(gd.alive)add(this.mesh.guard,T(m4.trs([gd.x,M.BASE_Y+.55+Math.abs(Math.sin(t*2+gd.ph))*.01,gd.z],gd.ry)),c.col);}
      if(c.lord)add(this.mesh.lord,T(m4.trs([0,M.BASE_Y+1.05,-.05],Math.sin(t*.7)*.6)),c.col);
      if(c.crown){const k=clamp((t-c.crown.t0)/2.2,0,1),y=M.BASE_Y+1.05+.37+(1-smooth(k))*5;add(this.mesh.crown,T(m4.trs([0,y,-.05],t*1.2,0,0,.085)),c.col,1,(1-k)*1.5);}
      if(c.shieldA>.02)add(this.mesh.shield,m4.trs([c.x,c.y+.2,c.z],t*.3,0,0,[1,.85+.05*Math.sin(t*3),1]),[.55,.8,1],c.shieldA,c.glow,true);
      if(c.ghost){const k=clamp((t-c.ghostT)/1.2,0,1);add(this.mesh.ghost,m4.trs([c.x,c.y+1.8+Math.sin(t*1.6+c.x)*.18+(1-k)*-.8,c.z],Math.sin(t*.9)*.5),c.col,.85*k,0,true);}}
    for(const o of this.objs){
      if(o.type==='cat'){add(this.mesh.cat,m4.trs(o.p,o.ry,0,0,1.6));add(this.mesh.catArm,m4.mul(m4.trs(o.p,o.ry,0,0,1.6),m4.trs([-.1,.72,0],0,0,o.arm)));}
      if(o.type==='boulder')add(this.mesh.boulder,m4.trs(o.p,o.rot,o.rot*.7,0,1.3));
      if(o.type==='keg')add(this.mesh.keg,m4.trs(o.p,o.rot,0,o.rot*.3,1.4));
      if(o.type==='dragon'){const B=m4.trs(o.p,o.ry,0,Math.sin(o.flap*.5)*.08,1.6),fl=Math.sin(o.flap)*.7;
        add(this.mesh.dBody,m4.mul(B,m4.trs([0,0,0],0,Math.PI/2-.35,0)),[1,1,1],1,o.breath?.4:0);add(this.mesh.dHead,m4.mul(B,m4.trs([0,.02,.74],0,o.breath?.35:0)));
        add(this.mesh.dWing,m4.mul(B,m4.trs([.25,.15,0],0,0,fl)));add(this.mesh.dWing,m4.mul(B,m4.trs([-.25,.15,0],Math.PI,0,-fl)));
        add(this.mesh.dTail,m4.mul(B,m4.trs([0,0,-.35],0,-Math.PI/2-.2,0)));}}
    if(this.reticleAt){const k=(t-this.reticleT),s=1+.15*Math.sin(t*10)+Math.max(0,.6-k*3);add(this.mesh.reticle,m4.trs(this.reticleAt,t*1.5,0,0,s),this.reticleCol,1,1.5);}
    // Schattenpass
    const sd=sunDir,LV=m4.lookAt(v3.add([0,0,0],v3.scale(sd,30)),[0,0,0],[0,1,0]),SVP=m4.mul(m4.ortho(-17,17,-17,17,1,70),LV);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowT.fb);gl.viewport(0,0,this.SH,this.SH);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.clear(gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);
    let pr=this.P.shadow;gl.useProgram(pr.p);gl.uniformMatrix4fv(pr.u.uVP,false,SVP);gl.uniform1f(pr.u.uTime,t);
    gl.uniformMatrix4fv(pr.u.uModel,false,m4.ident());gl.bindVertexArray(this.forestM.vao);gl.drawArrays(gl.TRIANGLES,0,this.forestM.count);
    for(const d of D)if(!d.tr){gl.uniformMatrix4fv(pr.u.uModel,false,d.M);gl.bindVertexArray(d.mesh.vao);gl.drawArrays(gl.TRIANGLES,0,d.mesh.count);}
    const nc=this.fillChunks();if(nc){pr=this.P.shadowI;gl.useProgram(pr.p);gl.uniformMatrix4fv(pr.u.uVP,false,SVP);gl.bindVertexArray(this.chunkVao);gl.drawArraysInstanced(gl.TRIANGLES,0,this.mesh.cube.count,nc);}
    // Hauptpass
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.msT.fb);gl.viewport(0,0,this.bw,this.bh);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    // Himmel
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);pr=this.P.sky;gl.useProgram(pr.p);gl.uniformMatrix4fv(pr.u.uInvVP,false,this.invVP);gl.uniform3fv(pr.u.uCam,this.eye);
    const zen=v3.scale(p.zen,dk+this.lightning*.8),hor=v3.scale(p.hor,dk*.8+.2+this.lightning);
    gl.uniform3fv(pr.u.uZen,zen);gl.uniform3fv(pr.u.uHor,hor);gl.uniform3fv(pr.u.uGnd,p.gnd);gl.uniform3fv(pr.u.uSunDir,sunDir);gl.uniform3fv(pr.u.uSunCol,v3.scale(p.sunCol,dk));
    gl.uniform1f(pr.u.uTime,t);gl.uniform1f(pr.u.uStars,p.stars);gl.uniform1f(pr.u.uClouds,p.clouds);gl.uniform1f(pr.u.uMoon,p.moon);
    gl.bindVertexArray(this.quadVao);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
    const setLit=pr=>{gl.useProgram(pr.p);gl.uniformMatrix4fv(pr.u.uVP,false,VP);gl.uniform1f(pr.u.uTime,t);gl.uniform3fv(pr.u.uSunDir,sunDir);gl.uniform3fv(pr.u.uSunCol,sunCol);
      gl.uniform3fv(pr.u.uSkyAmb,v3.scale(p.sky,dk*.85+.15));gl.uniform3fv(pr.u.uGndAmb,p.ground);gl.uniform3fv(pr.u.uFogCol,v3.scale(p.fog,dk*.8+.2));gl.uniform1f(pr.u.uFog,p.fogD);gl.uniform3fv(pr.u.uCam,this.eye);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadowT.depth);gl.uniform1i(pr.u.uShadow,0);gl.uniformMatrix4fv(pr.u.uSVP,false,SVP);
      gl.uniform1i(pr.u.uNL,NL);gl.uniform4fv(pr.u.uLP,LP);gl.uniform3fv(pr.u.uLC,LC);gl.uniform1f(pr.u.uAlpha,1);gl.uniform1f(pr.u.uGlow,0);gl.uniform3f(pr.u.uTint,1,1,1);};
    pr=this.P.mesh;setLit(pr);gl.uniformMatrix4fv(pr.u.uModel,false,m4.ident());
    gl.bindVertexArray(this.terrainM.vao);gl.drawArrays(gl.TRIANGLES,0,this.terrainM.count);gl.bindVertexArray(this.forestM.vao);gl.drawArrays(gl.TRIANGLES,0,this.forestM.count);
    for(const d of D)if(!d.tr){gl.uniformMatrix4fv(pr.u.uModel,false,d.M);gl.uniform3fv(pr.u.uTint,d.tint);gl.uniform1f(pr.u.uGlow,d.glow);gl.bindVertexArray(d.mesh.vao);gl.drawArrays(gl.TRIANGLES,0,d.mesh.count);}
    if(nc){const pi=this.P.inst;setLit(pi);gl.bindVertexArray(this.chunkVao);gl.drawArraysInstanced(gl.TRIANGLES,0,this.mesh.cube.count,nc);}
    // Flecken am Boden
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    if(this.decals.length){const n=this.fillDecals();pr=this.P.decal;gl.useProgram(pr.p);gl.uniformMatrix4fv(pr.u.uVP,false,VP);gl.uniform3fv(pr.u.uAmb,v3.add(v3.scale(p.sky,.9*dk),v3.scale(sunCol,.45)));gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);
      gl.bindVertexArray(this.decVao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,n);gl.disable(gl.POLYGON_OFFSET_FILL);}
    // Durchsichtiges: Schutzkuppeln, Geister
    pr=this.P.mesh;setLit(pr);gl.depthMask(false);
    for(const d of D)if(d.tr){gl.uniformMatrix4fv(pr.u.uModel,false,d.M);gl.uniform3fv(pr.u.uTint,d.tint);gl.uniform1f(pr.u.uAlpha,d.alpha);gl.uniform1f(pr.u.uGlow,d.glow);gl.bindVertexArray(d.mesh.vao);gl.drawArrays(gl.TRIANGLES,0,d.mesh.count);}
    // Partikel: erst normal gemischt, dann additiv
    const R=[this.V[0],this.V[4],this.V[8]],U=[this.V[1],this.V[5],this.V[9]];pr=this.P.part;gl.useProgram(pr.p);gl.uniformMatrix4fv(pr.u.uVP,false,VP);gl.uniform3fv(pr.u.uRight,R);gl.uniform3fv(pr.u.uUp,U);gl.uniform3fv(pr.u.uCam,this.eye);
    gl.bindVertexArray(this.partVao);
    for(const add of [false,true]){const n=this.fillParts(add);if(!n)continue;gl.blendFunc(gl.SRC_ALPHA,add?gl.ONE:gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,n);}
    gl.disable(gl.BLEND);gl.depthMask(true);gl.bindVertexArray(null);
    // MSAA auflösen, Bloom, Zusammensetzen
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.msT.fb);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.sT.fb);gl.blitFramebuffer(0,0,this.bw,this.bh,0,0,this.bw,this.bh,gl.COLOR_BUFFER_BIT,gl.NEAREST);
    gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(this.quadVao);
    const pass=(prg,tgt,src,set)=>{gl.useProgram(prg.p);gl.bindFramebuffer(gl.FRAMEBUFFER,tgt?tgt.fb:null);gl.viewport(0,0,tgt?tgt.w:this.bw,tgt?tgt.h:this.bh);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,src.tex);gl.uniform1i(prg.u.uTex,0);set&&set(prg);gl.drawArrays(gl.TRIANGLES,0,3);};
    const blur=(a,b)=>{pass(this.P.blur,b,a,q=>gl.uniform2f(q.u.uDir,1/a.w,0));pass(this.P.blur,a,b,q=>gl.uniform2f(q.u.uDir,0,1/a.h));};
    pass(this.P.down,this.b1,this.sT,q=>{gl.uniform2f(q.u.uPx,1/this.bw,1/this.bh);gl.uniform1f(q.u.uThr,.5);});blur(this.b1,this.b1t);
    pass(this.P.down,this.b2,this.b1,q=>{gl.uniform2f(q.u.uPx,.5/this.b1.w,.5/this.b1.h);gl.uniform1f(q.u.uThr,0);});blur(this.b2,this.b2t);blur(this.b2,this.b2t);
    pr=this.P.comp;gl.useProgram(pr.p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.bw,this.bh);
    [this.sT,this.b1,this.b2].forEach((tg,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,tg.tex);});gl.uniform1i(pr.u.uS,0);gl.uniform1i(pr.u.uB1,1);gl.uniform1i(pr.u.uB2,2);
    gl.uniform4fv(pr.u.uFl,this.flash);gl.uniform3fv(pr.u.uGrade,p.grade);gl.uniform1f(pr.u.uChroma,.0015+(this.effects?this.chroma:0));gl.uniform1f(pr.u.uTime,t%100);gl.uniform1f(pr.u.uVig,.85);
    gl.uniform1f(pr.u.uSat,p.sat);gl.uniform1f(pr.u.uExp,p.exp);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);}
  fillChunks(){const d=this.chunkData;let n=0;for(const c of this.chunks){const o=n*11,h=c.ang*.5,s=Math.sin(h);
      d[o]=c.p[0];d[o+1]=c.p[1];d[o+2]=c.p[2];d[o+3]=c.s;d[o+4]=c.ax[0]*s;d[o+5]=c.ax[1]*s;d[o+6]=c.ax[2]*s;d[o+7]=Math.cos(h);d[o+8]=c.col[0];d[o+9]=c.col[1];d[o+10]=c.col[2];n++;}
    if(n){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.chunkBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,d.subarray(0,n*11));}return n;}
  fillParts(add){const d=this.partData;let n=0;for(const p of this.parts){if(!!p.add!==add)continue;const k=p.age/p.life,a=(p.col[3]??1)*(k<.1?k*10:1-Math.pow(k,1.5)),o=n*12,s=p.size*(1+(p.grow||0)*k);
      d[o]=p.x;d[o+1]=p.y;d[o+2]=p.z;d[o+3]=s;d[o+4]=p.col[0];d[o+5]=p.col[1];d[o+6]=p.col[2];d[o+7]=Math.max(0,a);d[o+8]=p.vx;d[o+9]=p.vy;d[o+10]=p.vz;d[o+11]=p.type||0;n++;}
    if(n){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.partBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,d.subarray(0,n*12));}return n;}
  fillDecals(){const d=this.decData;let n=0;for(const e of this.decals){const o=n*10;d[o]=e.x;d[o+1]=e.y;d[o+2]=e.z;d[o+3]=e.size;d[o+4]=e.col[0];d[o+5]=e.col[1];d[o+6]=e.col[2];d[o+7]=e.col[3];d[o+8]=e.rot;d[o+9]=e.seed;n++;}
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.decBuf);gl.bufferSubData(gl.ARRAY_BUFFER,0,d.subarray(0,n*10));return n;}
}
