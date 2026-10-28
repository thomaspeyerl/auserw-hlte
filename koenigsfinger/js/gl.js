// Grundlagen der 3D-Engine: kleine Matrix-/Vektormathematik und WebGL2-Hilfen (Shader, Puffer, Render-Ziele).

/* ---------- Mathematik (Matrizen spaltenweise wie in WebGL) ---------- */
export const v3={
  add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],scale:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]),norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];},
  lerp:(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]};

export const m4={
  ident:()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
  mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;},
  persp(fov,asp,n,f){const t=1/Math.tan(fov/2),o=new Float32Array(16);o[0]=t/asp;o[5]=t;o[10]=(f+n)/(n-f);o[11]=-1;o[14]=2*f*n/(n-f);return o;},
  ortho(l,r,b,t,n,f){const o=m4.ident();o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);return o;},
  lookAt(e,c,up){const z=v3.norm(v3.sub(e,c)),x=v3.norm(v3.cross(up,z)),y=v3.cross(z,x);
    return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-v3.dot(x,e),-v3.dot(y,e),-v3.dot(z,e),1]);},
  /* Translation · RotationY · RotationX · RotationZ · Skalierung */
  trs(p,ry=0,rx=0,rz=0,s=1){const sy=Math.sin(ry),cy=Math.cos(ry),sx=Math.sin(rx),cx=Math.cos(rx),sz=Math.sin(rz),cz=Math.cos(rz);
    const sc=Array.isArray(s)?s:[s,s,s];
    // R = Ry*Rx*Rz
    const r00=cy*cz+sy*sx*sz,r01=-cy*sz+sy*sx*cz,r02=sy*cx,r10=cx*sz,r11=cx*cz,r12=-sx,r20=-sy*cz+cy*sx*sz,r21=sy*sz+cy*sx*cz,r22=cy*cx;
    return new Float32Array([r00*sc[0],r10*sc[0],r20*sc[0],0,r01*sc[1],r11*sc[1],r21*sc[1],0,r02*sc[2],r12*sc[2],r22*sc[2],0,p[0],p[1],p[2],1]);},
  inv(m){const a=m,o=new Float32Array(16);
    const b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5],b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],
      b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12],b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14];
    const d=1/(b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06);
    o[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*d;o[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*d;o[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*d;o[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*d;
    o[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*d;o[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*d;o[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*d;o[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*d;
    o[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*d;o[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*d;o[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*d;o[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*d;
    o[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*d;o[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*d;o[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*d;o[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*d;return o;},
  xform(m,p){const x=p[0],y=p[1],z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15];return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w];}};

export const clamp=(x,a,b)=>x<a?a:x>b?b:x;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>t*t*(3-2*t);
export const hexRgb=h=>{const n=parseInt(h.slice(1),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];};

/* ---------- WebGL2 ---------- */
export function program(gl,vs,fs,defs=''){
  const pre='#version 300 es\nprecision highp float;precision highp int;\n'+defs+'\n';
  const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,pre+s);gl.compileShader(o);
    if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(o);console.warn(log,'\n'+(pre+s).split('\n').map((l,i)=>(i+1)+': '+l).join('\n'));throw new Error('Shader: '+log);}return o;};
  const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Link: '+gl.getProgramInfoLog(p));
  const u={};for(let i=0,n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i<n;i++){const nm=gl.getActiveUniform(p,i).name.replace(/\[0\]$/,'');u[nm]=gl.getUniformLocation(p,nm);}
  return {p,u};}

/* Mesh aus verschachtelten Ecken: Position(3) Normale(3) Farbe(3) Material(1) = 10 Floats */
export function meshVAO(gl,data){const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
  [[0,3,0],[1,3,12],[2,3,24],[3,1,36]].forEach(([l,n,o])=>{gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,40,o);});
  gl.bindVertexArray(null);return {vao,buf:b,count:data.length/10};}

export function target(gl,w,h,{depthTex=false,color=true,msaa=0,float=false}={}){
  const t={w,h,fb:gl.createFramebuffer()};gl.bindFramebuffer(gl.FRAMEBUFFER,t.fb);
  if(msaa){t.rb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,t.rb);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,msaa,gl.RGBA8,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,t.rb);
    t.db=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,t.db);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,msaa,gl.DEPTH_COMPONENT24,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,t.db);return t;}
  if(color){t.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t.tex);gl.texImage2D(gl.TEXTURE_2D,0,float?gl.RGBA16F:gl.RGBA8,w,h,0,gl.RGBA,float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
    texParams(gl,gl.LINEAR,gl.CLAMP_TO_EDGE);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t.tex,0);}
  if(depthTex){t.depth=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t.depth);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
    texParams(gl,gl.NEAREST,gl.CLAMP_TO_EDGE);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,t.depth,0);}
  return t;}
export function texParams(gl,f,w){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,w);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,w);}
export function freeTarget(gl,t){if(!t)return;gl.deleteFramebuffer(t.fb);['tex','depth'].forEach(k=>t[k]&&gl.deleteTexture(t[k]));['rb','db'].forEach(k=>t[k]&&gl.deleteRenderbuffer(t[k]));}
