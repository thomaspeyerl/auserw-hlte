// Shader der 3D-Engine (GLSL ES 3.00). Farben werden mit Faktor 0.5 gespeichert, damit Bloom über 1.0 hinaus Luft hat.

export const MESH_VS=`
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec3 aCol;layout(location=3) in float aMat;
#ifdef INST
layout(location=4) in vec4 iPosS;layout(location=5) in vec4 iRot;layout(location=6) in vec3 iCol;
#endif
uniform mat4 uVP,uModel;uniform float uTime;
out vec3 vW;out vec3 vN;out vec3 vC;flat out int vM;
vec3 qrot(vec4 q,vec3 v){return v+2.*cross(q.xyz,cross(q.xyz,v)+q.w*v);}
void main(){vec3 p=aPos,n=aNor;int m=int(aMat+.5);
  if(m==2){float w=p.x/.5;p.z+=sin(uTime*6.+p.x*14.)*.06*w;p.y+=sin(uTime*4.+p.x*9.)*.015*w;}
#ifdef INST
  vec3 wp=qrot(iRot,p*iPosS.w)+iPosS.xyz;vec3 wn=qrot(iRot,n);vC=aCol*iCol;
#else
  vec3 wp=(uModel*vec4(p,1.)).xyz;vec3 wn=mat3(uModel)*n;vC=aCol;
#endif
  vW=wp;vN=wn;vM=m;
#ifdef SHADOW
  gl_Position=uVP*vec4(wp,1.);
#else
  gl_Position=uVP*vec4(wp,1.);
#endif
}`;

export const MESH_FS=`
in vec3 vW;in vec3 vN;in vec3 vC;flat in int vM;
uniform vec3 uTint;uniform float uAlpha,uTime,uGlow;
uniform vec3 uSunDir,uSunCol,uSkyAmb,uGndAmb,uFogCol,uCam;uniform float uFog;
uniform highp sampler2D uShadow;uniform mat4 uSVP;
uniform int uNL;uniform vec4 uLP[8];uniform vec3 uLC[8];
uniform float uClip,uBlood,uBloodY,uBloodSeed;
out vec4 o;
float shadow(vec3 p,vec3 n){vec4 s=uSVP*vec4(p+n*.05,1.);vec3 c=s.xyz/s.w*.5+.5;
  if(c.x<0.||c.x>1.||c.y<0.||c.y>1.||c.z>1.)return 1.;
  vec2 ts=1./vec2(textureSize(uShadow,0));float sum=0.;
  for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){float d=texture(uShadow,c.xy+vec2(i,j)*ts*1.3).r;sum+=c.z-.0012>d?0.:1.;}
  return sum/9.;}
void main(){
  if(uClip>0.&&vW.y+100.>uClip)discard;   // Burg wächst beim Bauen Schicht für Schicht
#ifdef SHADOW
  o=vec4(1.);return;
#endif
  vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;vec3 base=vC;
  if(vM==1||vM==2)base*=uTint;
  vec3 v=normalize(uCam-vW);
  if(vM==3){o=vec4(base*(2.2+uGlow)*.5,uAlpha);return;}
  if(vM==5){float f=pow(1.-abs(dot(n,v)),2.2);float hex=step(.92,fract(vW.y*9.+sin(vW.x*9.)*.3))+step(.95,fract(atan(vW.z,vW.x)*4.));
    o=vec4(uTint*(.5+2.*f+hex*.6+uGlow*.9)*.5,clamp((.08+.55*f+hex*.12+uGlow*.18)*uAlpha,0.,1.));return;}
  if(vM==6){float f=pow(1.-abs(dot(n,v)),1.4);o=vec4(vec3(.75,.88,1.)*(1.2+f*1.5)*.5,(.25+.45*f)*uAlpha);return;}
  float sh=shadow(vW,n),dl=max(dot(n,uSunDir),0.)*sh;
  vec3 amb=mix(uGndAmb,uSkyAmb,n.y*.5+.5);
  vec3 col=base*(amb+uSunCol*dl);
  if(vM==4){vec3 r=reflect(-v,n);float sp=pow(max(dot(r,uSunDir),0.),20.)*(.3+.7*sh);
    col=base*(amb*1.3+uSunCol*dl)+uSunCol*sp*2.+base*pow(1.-max(dot(n,v),0.),3.)*.8+base*.25;}
  for(int i=0;i<8;i++){if(i>=uNL)break;vec3 L=uLP[i].xyz-vW;float d=length(L);float at=uLP[i].w/(1.+d*d*1.2);col+=base*uLC[i]*(max(dot(n,L/d),0.)*.85+.15)*at;}
  // Blut läuft die Mauern hinunter: senkrechte Rinnsale unterschiedlicher Länge, oben breiter
  if(uBlood>0.&&vM<=1&&abs(n.y)<.55){float cl=floor((vW.x*1.3+vW.z*1.7)*11.);float r=fract(sin(cl*91.7+uBloodSeed)*43758.5);
    float top=uBloodY-100.-r*.35,len=(.2+r*.9)*uBlood,y=vW.y;
    float m=step(.42-uBlood*.25,r)*step(y,top)*smoothstep(top-len-.04,top-len+.02,y);
    float sp=smoothstep(.0,.25,uBlood)*step(.8,fract(sin(dot(floor(vW.xz*14.),vec2(12.9,78.2))+uBloodSeed)*43758.5))*step(y,top+.3);
    col=mix(col,vec3(.25,.0,.0)*(amb*.7+uSunCol*dl*.5)+vec3(.04,0.,0.),clamp(max(m*.92,sp*.7),0.,1.));}
  col+=base*uGlow;
  float fog=1.-exp(-length(vW-uCam)*uFog);col=mix(col,uFogCol,fog);
  o=vec4(col*.5,uAlpha);}`;

export const QUAD_VS=`layout(location=0) in vec2 aP;out vec2 vU;void main(){vU=aP*.5+.5;gl_Position=vec4(aP,0.,1.);}`;

export const SKY_FS=`
in vec2 vU;uniform mat4 uInvVP;uniform vec3 uCam,uZen,uHor,uGnd,uSunDir,uSunCol;uniform float uTime,uStars,uClouds,uMoon;out vec4 o;
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){vec4 p=uInvVP*vec4(vU*2.-1.,1.,1.);vec3 d=normalize(p.xyz/p.w-uCam);
  float y=d.y;vec3 c=y>0.?mix(uHor,uZen,pow(clamp(y,0.,1.),.55)):mix(uHor,uGnd,clamp(-y*4.,0.,1.));
  float s=max(dot(d,uSunDir),0.);c+=uSunCol*(pow(s,800.)*(uMoon>.5?6.:14.)+pow(s,12.)*.25+pow(s,3.)*.08);
  if(uStars>0.&&y>0.){vec2 g=d.xz/(y+.2)*90.;vec2 cl=floor(g);float r=h(cl);if(r>.985){vec2 f=fract(g)-.5;c+=vec3(1.)*uStars*smoothstep(.15,0.,length(f))*(.5+.5*sin(uTime*2.+r*90.));}}
  if(uClouds>0.&&y>0.){vec2 q=d.xz/(y+.12)*2.+vec2(uTime*.02,0.);float n=vn(q)*.6+vn(q*2.3)*.3+vn(q*5.1)*.1;float cl=smoothstep(.45,.8,n)*uClouds*smoothstep(0.,.25,y);
    c=mix(c,mix(uHor,vec3(1.),.35)*(.6+.6*s),cl*.85);}
  o=vec4(c*.5,1.);}`;

/* Partikel: instanzierte Quads. Typ 0 weich (Rauch/Feuer), 1 hart (Blutstropfen), 2 Streifen (Funken/Regen) */
export const PART_VS=`
layout(location=0) in vec4 iP;layout(location=1) in vec4 iC;layout(location=2) in vec4 iV;
uniform mat4 uVP;uniform vec3 uRight,uUp,uCam;out vec4 vC;out vec2 vQ;flat out int vT;
void main(){int k=gl_VertexID;vec2 q=vec2(k&1,k>>1)*2.-1.;vT=int(iV.w+.5);vC=iC;vQ=q;vec3 w;
  if(vT==2){vec3 ax=iV.xyz;float L=length(ax);ax=L>1e-4?ax/L:uUp;vec3 side=normalize(cross(ax,normalize(uCam-iP.xyz)));
    w=iP.xyz+side*q.x*iP.w*.5+ax*q.y*(iP.w+L*.05)*.5;}
  else w=iP.xyz+(uRight*q.x+uUp*q.y)*iP.w*.5;
  gl_Position=uVP*vec4(w,1.);}`;
export const PART_FS=`
in vec4 vC;in vec2 vQ;flat in int vT;out vec4 o;
void main(){float r=dot(vQ,vQ);float a;
  if(vT==1)a=smoothstep(1.,.7,r);else if(vT==2)a=exp(-vQ.x*vQ.x*3.)*smoothstep(1.,.3,abs(vQ.y));else a=exp(-r*3.2);
  if(a<.004)discard;o=vec4(vC.rgb*.5,vC.a*a);}`;

/* Bodenflecken: Blut und Brandspuren als unregelmäßige Kleckse */
export const DECAL_VS=`
layout(location=0) in vec2 aQ;layout(location=1) in vec4 iD;layout(location=2) in vec4 iC;layout(location=3) in vec2 iE;
uniform mat4 uVP;out vec2 vQ;out vec4 vC;out float vS;
void main(){float c=cos(iE.x),s=sin(iE.x);vec2 q=aQ*iD.w;vec2 r=vec2(c*q.x-s*q.y,s*q.x+c*q.y);vQ=aQ;vC=iC;vS=iE.y;
  gl_Position=uVP*vec4(iD.x+r.x,iD.y,iD.z+r.y,1.);}`;
export const DECAL_FS=`
in vec2 vQ;in vec4 vC;in float vS;uniform vec3 uAmb;out vec4 o;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){float ang=atan(vQ.y,vQ.x);float r=length(vQ);
  float edge=.62+.25*vn(vec2(ang*2.,vS))+.15*vn(vQ*5.+vS);
  float a=smoothstep(edge,edge-.12,r);
  float drops=0.;for(int i=0;i<5;i++){float fi=float(i);vec2 c=vec2(cos(vS+fi*2.4),sin(vS*1.3+fi*1.7))*(.75+.2*h(vec2(fi,vS)));drops=max(drops,smoothstep(.13,.08,length(vQ-c)));}
  a=max(a,drops)*vC.a;if(a<.01)discard;o=vec4(vC.rgb*min(uAmb,vec3(1.))*(.8+.4*vn(vQ*7.+vS))*.5,a);}`;

export const DOWN_FS=`in vec2 vU;uniform sampler2D uTex;uniform vec2 uPx;uniform float uThr;out vec4 o;
void main(){vec3 c=(texture(uTex,vU-uPx).rgb+texture(uTex,vU+vec2(uPx.x,-uPx.y)).rgb+texture(uTex,vU+vec2(-uPx.x,uPx.y)).rgb+texture(uTex,vU+uPx).rgb)*.25;
  o=vec4(max(c-uThr,0.)*(1.+uThr*2.),1.);}`;
export const BLUR_FS=`in vec2 vU;uniform sampler2D uTex;uniform vec2 uDir;out vec4 o;
void main(){vec4 c=texture(uTex,vU)*.2270270270;c+=(texture(uTex,vU+uDir*1.3846153846)+texture(uTex,vU-uDir*1.3846153846))*.3162162162;
  c+=(texture(uTex,vU+uDir*3.2307692308)+texture(uTex,vU-uDir*3.2307692308))*.0702702703;o=c;}`;
export const COMP_FS=`in vec2 vU;uniform sampler2D uS,uB1,uB2;uniform vec4 uFl;uniform vec3 uGrade;uniform float uChroma,uTime,uVig,uSat,uExp;out vec4 o;
void main(){vec2 cd=(vU-.5)*uChroma;
  vec3 c=vec3(texture(uS,vU+cd).r,texture(uS,vU).g,texture(uS,vU-cd).b)*2.;
  c+=(texture(uB1,vU).rgb*.9+texture(uB2,vU).rgb*1.1)*2.;
  c+=uFl.rgb*uFl.a;c*=uGrade*uExp;
  float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,uSat);
  c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);
  vec2 v=vU-.5;c*=1.-dot(v,v)*uVig;
  c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+uTime)*43758.5453)-.5)*.02;
  o=vec4(clamp(c,0.,1.),1.);}`;
