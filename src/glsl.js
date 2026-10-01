// All GLSL. Every scene shader writes two targets: oH = human linear RGB, oB = bee receptor bands
// (r = green 544nm, g = blue 436nm, b = UV 344nm). The post pass blends between them.
import { POND_R } from './world.js';
const f = x => (Math.round(x * 1e5) / 1e5).toFixed(5);

export const HEAD = `#version 300 es
precision highp float;precision highp int;precision highp sampler2DShadow;
`;

export const COMMON = `
uniform mat4 uVP,uView,uSh0M,uSh1M;
uniform vec3 uCam,uSun,uSunC,uSkyZ,uSkyH,uGndC,uBSun,uBSkyZ,uBSkyH,uBGnd,uLampP,uLampC;
uniform float uT,uFogD,uPol,uShOn;
uniform sampler2DShadow uSh0,uSh1;
uniform float HB,PB,WY;uniform vec2 POND,PATCH;uniform ivec2 uSeed;uniform vec3 uPatchC;
const float POR=${f(POND_R)};
float hash(ivec2 p){p+=uSeed;uint h=(uint(p.x)*1597334677u)^(uint(p.y)*3812015801u);h^=h>>16;h*=2246822519u;h^=h>>13;h*=3266489917u;h^=h>>16;return float(h)*(1./4294967296.);}
float vnoise(vec2 p){vec2 i=floor(p),f=p-i,u=f*f*f*(f*(f*6.-15.)+10.);ivec2 q=ivec2(i);
return mix(mix(hash(q),hash(q+ivec2(1,0)),u.x),mix(hash(q+ivec2(0,1)),hash(q+ivec2(1,1)),u.x),u.y);}
float fbm(vec2 p,int o){float s=0.,a=.5;for(int i=0;i<o;i++){s+=a*vnoise(p);p=vec2(1.6*p.x+1.2*p.y+17.3,-1.2*p.x+1.6*p.y+9.1);a*=.5;}return s;}
float n3(vec3 p){return vnoise(p.xy+p.z*vec2(17.31,-9.7));}
float hgt(vec2 p){
 float h=(fbm(p/420.,4)-.5)*26.;
 h+=(fbm(p/70.+vec2(5,0),3)-.5)*3.2;
 h+=(vnoise(p/6.)-.5)*.3;
 h+=(vnoise(p/.7)-.5)*.035;
 h=mix(HB+(h-HB)*.15,h,smoothstep(8.,40.,length(p)));
 float dp=length(p-POND);h=mix(PB+.35+(h-PB)*.3,h,smoothstep(POR*1.8,POR*3.2,dp));
 float dw=dp*(1.+.45*(vnoise(p/9.)-.5)+.2*(vnoise(p/3.1)-.5));
 return mix(PB-1.6,h,smoothstep(POR*.3,POR*1.15,dw));
}
vec2 wind(vec2 p){float g=sin(p.x*.11+uT*1.3)*.5+sin(p.y*.07-uT*.9+p.x*.05)*.5;
 float gu=.35+.65*smoothstep(.2,.9,vnoise(p/25.+vec2(uT*.12,0)));return vec2(.8,.45)*gu*(.6+.4*g);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
`;

export const LIGHT = `
layout(location=0) out vec4 oH;layout(location=1) out vec4 oB;float gSunK=1.;
vec3 band(vec3 c,float uv){return vec3(dot(c,vec3(.3,.7,0)),dot(c,vec3(0,.16,.84)),uv);}
#ifndef SH
float shTap(vec3 Q,mat4 M,float b,float r){vec4 c=M*vec4(Q,1);c.xyz=c.xyz*.5+.5;
 if(any(greaterThan(abs(c.xy-.5),vec2(.495)))||c.z>1.)return -1.;
 float s=0.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)s+=r==0.?texture(uSh0,vec3(c.xy+vec2(i,j)*b,c.z-.0004)):texture(uSh1,vec3(c.xy+vec2(i,j)*b,c.z-.0006));
 return s/9.;}
#endif
float shadowF(vec3 P,vec3 N){
#ifdef SH
return 1.;
#else
if(uShOn<.5)return 1.;
 // near cascade (grass-blade detail) fades out radially into the far one: no visible square boundary
 vec4 c=uSh0M*vec4(P,1);float e=length(c.xy);
 float s1=shTap(P+N*.06,uSh1M,.8/2048.,1.);if(s1<0.)s1=1.;
 if(e<.97){float s0=shTap(P+N*.003,uSh0M,.6/4096.,0.);if(s0>=0.)return mix(s0,s1,smoothstep(.3,.95,e));}
 return s1;
#endif
}
vec3 skyH(vec3 d){float mu=max(dot(d,uSun),0.);
 vec3 c=mix(uSkyH,uSkyZ,pow(clamp(d.y,0.,1.),.45))+uSunC*(.03*pow(mu,4.)+.12*pow(mu,40.));
 return mix(c,uGndC*.6+uSkyH*.4,smoothstep(0.,-.15,d.y));}
vec3 skyB(vec3 d){float mu=max(dot(d,uSun),0.);
 vec3 c=mix(uBSkyH,uBSkyZ,pow(clamp(d.y,0.,1.),.45))+uBSun*(.03*pow(mu,4.)+.12*pow(mu,40.));
 return mix(c,uBGnd*.6+uBSkyH*.4,smoothstep(0.,-.15,d.y));}
void fog(inout vec3 h,inout vec3 b,vec3 P){vec3 v=P-uCam;float d=length(v);v/=d;
 float k=1.-exp(-d*uFogD*(1.+2.*exp(-max(P.y-HB,0.)*.05)));
 float s=pow(max(dot(v,uSun),0.),6.)*.5;
 h=mix(h,uSkyH*1.05+uSunC*s*.2,k);b=mix(b,uBSkyH*1.05+uBSun*s*.2,k);}
// albedo, UV reflectance, roughness, translucency, ambient occlusion, emission
void shade(vec3 P,vec3 N,vec3 alb,float uvr,float rough,float tr,float ao,vec3 em){
#ifdef SH
 oH=vec4(1);oB=vec4(1);return;
#else
 vec3 V=normalize(uCam-P),L=uSun;float sh=shadowF(P,N)*gSunK;
 float ndl=max(dot(N,L),0.),bl=pow(max(dot(-V,L),0.),3.)*tr*1.6+max(-dot(N,L),0.)*tr*.5;
 vec3 Hh=normalize(L+V);float fr=.04+.96*pow(1.-max(dot(N,V),0.),5.);
 float sp=pow(max(dot(N,Hh),0.),mix(600.,6.,rough))*mix(6.,.3,rough)*fr*ndl*sh;
 vec3 Lv=uLampP-P;float d2=dot(Lv,Lv);vec3 Ll=Lv*inversesqrt(d2);float lnd=max(dot(N,Ll),0.)+max(-dot(N,Ll),0.)*tr*.6;
 float lat=1./(1.+d2*40.);vec3 Hl=normalize(Ll+V);float lsp=pow(max(dot(N,Hl),0.),mix(600.,6.,rough))*mix(6.,.3,rough)*fr*lnd;
 float hm=N.y*.5+.5;
 vec3 aH=mix(uGndC,mix(uSkyH,uSkyZ,.6),hm)*ao,aB=mix(uBGnd,mix(uBSkyH,uBSkyZ,.6),hm)*ao;
 vec3 rB=band(alb,uvr),lB=band(uLampC,uLampC.b*.4);
 vec3 h=alb*(uSunC*(ndl*sh+bl*mix(.35,1.,sh))+aH+uLampC*lnd*lat)+uSunC*sp+uLampC*lsp*lat+em;
 vec3 b=rB*(uBSun*(ndl*sh+bl*mix(.35,1.,sh))+aB+lB*lnd*lat)+uBSun*sp+lB*lsp*lat+band(em,em.b);
 fog(h,b,P);oH=vec4(h,1);oB=vec4(b,1);
#endif
}
`;

// ---------------------------------------------------------------- sky
export const SKY_VS = `in vec2 aP;out vec2 vP;void main(){vP=aP;gl_Position=vec4(aP,1,1);}`;
export const SKY_FS = `in vec2 vP;uniform mat4 uIVP;uniform float uCloud;
void main(){vec4 w=uIVP*vec4(vP,1,1);vec3 d=normalize(w.xyz/w.w-uCam);
 vec3 h=skyH(d),b=skyB(d);float mu=dot(d,uSun);
 float disc=smoothstep(.99985,.9999,mu);h+=uSunC*disc*60.;b+=uBSun*disc*60.;
 if(d.y>0.){vec2 cp=d.xz/(d.y+.06)*900.+vec2(uT*3.,uT*1.2)+uCam.xz;
  float c=fbm(cp/1300.,5),c2=fbm(cp/1300.+uSun.xz*.06,5);
  float a=smoothstep(.52-uCloud*.12,.78,c)*smoothstep(0.,.12,d.y);
  float lit=clamp(.6+(c-c2)*5.,.15,1.3);
  vec3 cc=uSunC*.32*lit+uSkyZ*.55;h=mix(h,cc,a);b=mix(b,band(cc,cc.b*.9),a);}
 // dorsal-rim polarisation: degree p=sin^2/(1+cos^2), e-vector perpendicular to sun plane
 if(uPol>0.&&d.y>0.){float p=(1.-mu*mu)/(1.+mu*mu);vec3 e=normalize(cross(d,uSun));
  vec2 es=normalize((mat3(uView)*e).xy+1e-5);vec2 n=vec2(-es.y,es.x);
  float l=abs(fract(dot(gl_FragCoord.xy,n)/14.)-.5);float line=smoothstep(.2,.05,l)*p*p*uPol*smoothstep(0.,.15,d.y);
  b=mix(b,b*(.8+.3*p)+vec3(.5,.8,1.)*line*.28*smoothstep(.3,.8,p)*length(uBSkyZ),uPol);}
 oH=vec4(h,1);oB=vec4(b,1);}`;

// ---------------------------------------------------------------- terrain
export const TERR_VS = `in vec2 aG;uniform vec2 uC;out vec3 vP;out vec3 vN;
void main(){vec2 g=sign(aG)*pow(abs(aG),vec2(3.))*1800.;vec2 p=uC+g;float h=hgt(p);
 float e=.03+length(g)*.01;vec3 n=normalize(vec3(hgt(p-vec2(e,0))-hgt(p+vec2(e,0)),2.*e,hgt(p-vec2(0,e))-hgt(p+vec2(0,e))));
 vP=vec3(p.x,h,p.y);vN=n;gl_Position=uVP*vec4(vP,1);}`;
export const TERR_FS = `in vec3 vP;in vec3 vN;
void main(){vec2 p=vP.xz;float d=length(vP-uCam);
 float n1=fbm(p*.05,3),n2=vnoise(p*2.3),n4=vnoise(p*.31);
 float n3=d<12.?vnoise(p*31.):.5;
 vec3 soil=mix(vec3(.13,.09,.055),vec3(.22,.16,.1),n2);
 vec3 lit=mix(vec3(.24,.2,.11),vec3(.13,.17,.06),n3);
 vec3 nr=mix(soil,lit,smoothstep(.35,.65,n3*.6+n2*.4));
 vec3 mb=vec3(0);
 if(d<2.2){ // millimetre ground for a bee's-eye view: pebbles, grains, fallen dead grass, moss cushions
  float k=1.-smoothstep(.7,2.2,d);
  vec2 q=p/.0045,ci=floor(q);float best=9.;vec2 bo=vec2(0);float bh=0.;
  for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 c=ci+vec2(i,j);ivec2 ic=ivec2(c);float h=hash(ic+ivec2(311,7));if(h>.16)continue;
   vec2 o=c+.15+.7*vec2(hash(ic+ivec2(1,93)),hash(ic+ivec2(57,5)));float r=.22+.3*hash(ic+ivec2(9,9));vec2 dv=(q-o)/r;float dd=length(dv*vec2(1.,1.+.5*h));if(dd<best){best=dd;bo=dv;bh=h;}}
  float peb=smoothstep(1.,.82,best);
  vec3 pc=mix(vec3(.24,.19,.13),vec3(.42,.35,.25),fract(bh*37.))*(.75+.35*vnoise(p*1900.));
  float gr=vnoise(p*1400.)*.6+vnoise(p*3100.)*.4;
  vec3 soil=mix(vec3(.09,.065,.04),vec3(.2,.15,.09),gr);
  vec2 lq=p/.025;ivec2 lc=ivec2(floor(lq));float la=hash(lc+ivec2(5,71))*3.14;vec2 lo=fract(lq)-.5;lo=rot(la)*lo;
  float straw=step(hash(lc+ivec2(19,3)),.55)*smoothstep(.045,.02,abs(lo.y+.05*sin(lo.x*9.)))*step(abs(lo.x),.42);
  float moss=smoothstep(.58,.72,vnoise(p*22.))*(.6+.4*vnoise(p*600.));
  vec3 g=mix(soil,vec3(.36,.31,.17)*(.8+.3*vnoise(vec2(lo.x*40.,lc.y))),straw);
  g=mix(g,mix(vec3(.05,.12,.03),vec3(.16,.26,.06),vnoise(p*900.)),moss*(1.-straw));
  g=mix(g,pc,peb);
  nr=mix(nr,g,k);
  mb=(vec3(bo.x,0,bo.y)*peb*.5+vec3(vnoise(p*1400.+7.)-.5,0,vnoise(p*1400.+3.)-.5)*.6*(1.-peb))*k;
 }
 vec3 md=mix(vec3(.12,.22,.045),vec3(.3,.31,.1),smoothstep(.3,.7,n1))*mix(.8,1.1,n4);
 float pf=1.-smoothstep(28.,62.,length(p-PATCH));
 md=mix(md,uPatchC,pf*.55*smoothstep(.3,.6,vnoise(p*.8)));
 float wf=smoothstep(.62,.75,fbm(p/38.+vec2(40,0),3));
 md=mix(md,mix(vec3(.6,.55,.5),vec3(.5,.1,.06),step(.5,vnoise(p*.13))),wf*.25*smoothstep(.4,.7,vnoise(p*1.7)));
 vec3 alb=mix(nr,md,smoothstep(.6,3.,d)*.85+.15*smoothstep(3.,30.,d));float uvr=.015+pf*.05;
 float pz=step(length(p-POND),POR*2.2);nr=mix(nr,mix(vec3(.08,.07,.04),vec3(.1,.13,.05),n3),pz*smoothstep(POR*2.2,POR*1.3,length(p-POND)));float wet=smoothstep(WY+.12,WY-.01,vP.y)*pz;alb=mix(alb,vec3(.09,.075,.05)*(.8+.4*n2),wet);
 float uw=clamp((WY-vP.y)*2.,0.,1.)*pz;
 if(uw>0.){float c=1.-abs(vnoise(p*3.1+uT*vec2(.21,.13))-vnoise(p*3.7-uT*vec2(.17,.2)));alb=mix(alb,vec3(.16,.14,.08),.5)*(.7+.9*pow(c,8.)*(1.-uw*.6));alb=mix(alb,vec3(.03,.07,.05),uw*.7);}
 vec3 N=normalize(vN+vec3(n2-.5,0,n3-.5)*.25*(1.-smoothstep(5.,30.,d))+mb);
 shade(vP,N,alb,uvr,mix(.95,.2,wet),.0,.85,vec3(0));}`;

// ---------------------------------------------------------------- water
export const WATER_VS = `in vec2 aG;out vec3 vP;void main(){vP=vec3(POND.x+aG.x*POR*1.6,WY,POND.y+aG.y*POR*1.6);gl_Position=uVP*vec4(vP,1);}`;
export const WATER_FS = `in vec3 vP;
float wh(vec2 p){float g=.35+.65*vnoise(p*.15+uT*vec2(.05,.03));return (vnoise(p*2.+uT*vec2(.2,.13))+.35*vnoise(p*6.-uT*vec2(.3,.08)))*g;}
void main(){vec2 p=vP.xz;float dep=WY-hgt(p);if(dep<-.02)discard;
 float e=.02,h0=wh(p);vec3 N=normalize(vec3(h0-wh(p+vec2(e,0)),e*55.,h0-wh(p+vec2(0,e))));
 vec3 V=normalize(uCam-vP);vec3 R=reflect(-V,N);R.y=abs(R.y);
 float fr=.02+.98*pow(1.-max(dot(N,V),0.),5.);float sh=shadowF(vP,vec3(0,1,0));float sp=pow(max(dot(R,uSun),0.),1500.)*sh;
 vec3 body=vec3(.012,.03,.022);
 vec3 h=mix(body*(uSunC*.3+uSkyZ),skyH(R)*.85,fr)+uSunC*sp*12.,b=mix(band(body,.01)*(uBSun*.3+uBSkyZ),skyB(R)*.85,fr)+uBSun*sp*12.;
 float a=clamp(smoothstep(0.,.6,dep)*.85+fr*.6,0.,1.)*smoothstep(-.02,.03,dep);
 // lapping: thin bright wavelets that run up the shallow edge
 float lap=smoothstep(.06,.0,dep)*smoothstep(-.02,.01,dep)*(.5+.5*sin(dep*160.-uT*2.2+vnoise(p*2.)*6.));
 h+=uSunC*lap*.08+uSkyH*lap*.2;b+=uBSun*lap*.08+uBSkyH*lap*.2;a=max(a,lap*.5);
 // lily pads (round, notched, floating in the mid-depth zone), a few white flowers
 vec2 cp=p/1.4;ivec2 c=ivec2(floor(cp));float hh=hash(c);
 if(hh<.4&&dep>.25){vec2 o=(vec2(c)+.25+.5*vec2(hash(c+ivec2(7,1)),hash(c+ivec2(2,9))))*1.4;vec2 q=p-o;float r=.13+.14*hash(c+ivec2(5,5));
  float an=atan(q.y,q.x)-hh*40.;float notch=smoothstep(.04,.12,abs(sin(an*.5)));float l=length(q);
  if(l<r&&notch>.5){float fl=step(hash(c+ivec2(3,8)),.12)*step(l,r*.32);
   vec3 al=fl>0.?vec3(.95,.93,.88):mix(vec3(.08,.2,.05),vec3(.2,.32,.08),vnoise(q*40.))*(.85+.15*cos(an*30.));
   vec3 Np=normalize(vec3(q*(fl>0.?3.:.4),1.).xzy);shade(vP+vec3(0,.002,0),Np,al,fl>0.?.08:.02,fl>0.?.6:.35,.3,1.,vec3(0));return;}}
 fog(h,b,vP);oH=vec4(h,a);oB=vec4(b,a);}`;

// ---------------------------------------------------------------- grass: camera-centred instanced rings
export const GRASS_VS = `in vec2 aB;uniform float uCs,uExt,uPrev,uLast,uWid;uniform int uN;uniform vec3 uFoc;
out vec3 vP;out vec3 vN;out vec3 vC;out float vY;
void main(){int ix=gl_InstanceID%uN,iz=gl_InstanceID/uN;
 vec2 base=floor(uFoc.xz/uCs)+vec2(ix,iz)-float(uN/2);ivec2 ci=ivec2(base);
 float r1=hash(ci),r2=hash(ci+ivec2(91,7)),r3=hash(ci+ivec2(13,57)),r4=hash(ci+ivec2(5,333));
 vec2 xz=(base+vec2(r1,r2))*uCs;float ring=length(xz-uFoc.xz),rk=hash(ci+ivec2(41,17));
 // circular LOD rings that cross-fade stochastically: this ring thins out over its outer 45%, the next fills in
 float fOut=uLast>.5?1.:1.-smoothstep(.55*uExt,.97*uExt,ring),fIn=uPrev<0.?0.:1.-smoothstep(.55*uPrev,.97*uPrev,ring);
 float gy=hgt(xz);
 float hv=.55+.45*vnoise(xz*.15);float tall=(.12+.42*r3*r3)*hv*mix(.45,1.,smoothstep(1.2,7.,length(xz)));
 bool reed0=length(xz-POND)<POR*2.2&&WY-gy>-.15&&WY-gy<.4&&r4<.5*smoothstep(.45,.7,vnoise(xz*.35));if(reed0)tall=.5+.9*r3*r3+max(WY-gy,0.);
 float fade=uLast>.5?1.-smoothstep(uExt*.6,uExt,ring):1.;
 float wd=WY-gy;bool pz=length(xz-POND)<POR*2.2,reed=pz&&wd>-.15&&wd<.4&&r4<.5*smoothstep(.45,.7,vnoise(xz*.35));
 if(rk>=fOut||rk<fIn||(pz&&wd>-.01&&!reed)||(abs(xz.x)<.32&&abs(xz.y)<.27)||fade<=0.){gl_Position=vec4(0,0,-2,1);return;}
 float yaw=r4*6.2832,cv=reed0?.05+.1*r1:.15+.6*hash(ci+ivec2(3,3));
 vec2 fw=vec2(cos(yaw),sin(yaw)),sd=vec2(-fw.y,fw.x);
 vec2 w=wind(xz)*(.5+.5*sin(uT*2.3+r1*6.28+xz.x*.4))*.6;
 float y=aB.y,ht=tall*fade;
 float bend=cv*y*y;vec2 off=(fw*bend*.7+w*y*y)*ht;
 float wid=uWid*(1.-y*.85)*(.7+.6*r2)*(reed0?2.2:1.);
 vec3 P=vec3(xz.x+off.x+sd.x*aB.x*wid,gy+ht*y*(1.-.25*bend*bend),xz.y+off.y+sd.y*aB.x*wid);
 vec3 T=normalize(vec3(fw.x*cv*2.*y*.7+w.x*2.*y,1.,fw.y*cv*2.*y*.7+w.y*2.*y));
 vP=P;vN=normalize(cross(vec3(sd.x,0,sd.y),T));vY=y;
 float dry=step(.86,hash(ci+ivec2(77,1)));
 vC=mix(mix(vec3(.05,.13,.02),vec3(.17,.33,.05),y)*(.75+.5*r3),mix(vec3(.3,.26,.12),vec3(.55,.48,.25),y),dry);
 if(reed0)vC=mix(vec3(.04,.1,.05),vec3(.16,.26,.1),y)*(.8+.4*r3)*mix(1.,.55,step(.9,y)*step(.7,r2));
 gl_Position=uVP*vec4(P,1);}`;
export const GRASS_FS = `in vec3 vP;in vec3 vN;in vec3 vC;in float vY;
void main(){vec3 N=normalize(gl_FrontFacing?vN:-vN);
 gSunK=mix(.3,1.,smoothstep(.05,.9,vY));
 shade(vP,N,vC,.025,.45,.9,mix(.35,1.,vY),vec3(0));}`;

// ---------------------------------------------------------------- flowers
// aM = (t radial, s side, mat id, guide) ; aC = (rgb, uv reflectance)
export const FLOWER_VS = `in vec3 aP,aN;in vec4 aC,aM;in vec4 iA,iB;uniform float uH;
out vec3 vP,vN,vL;out vec4 vC,vM;
void main(){float s=iB.x;vec3 p=aP*s;vec3 n=aN;
 vec2 w=wind(iA.xz)*.45+vec2(sin(uT*1.7+iB.y),cos(uT*1.3+iB.y))*.05;float k=clamp(aP.y/uH,0.,1.);k*=k;
 mat2 r=rot(iA.w);p.xz=r*p.xz;n.xz=r*n.xz;
 p.xz+=w*k*uH*s;p.y-=dot(w,w)*k*uH*s*.3;
 vP=iA.xyz+p;vN=n;vC=aC;vM=aM;vL=aP;gl_Position=uVP*vec4(vP,1);}`;
export const FLOWER_FS = `in vec3 vP,vN,vL;in vec4 vC,vM;
void main(){vec3 N=normalize(gl_FrontFacing?vN:-vN);float t=vM.x,s=vM.y;int m=int(vM.z+.5);
 vec3 a=vC.rgb;float uv=vC.a,tr=.5,ro=.6,ao=1.;vec3 em=vec3(0);
 if(m==1||m==2){ // petal: veins, nectar guide (UV-absorbing base), poppy blotch
  float vein=.5+.5*cos(s*70.+t*3.+sin(s*9.)*2.);a*=.82+.22*vein;a.g*=.94+.06*smoothstep(0.,.4,t);a*=.9+.1*vnoise(vec2(t*30.,s*12.));
  float g=smoothstep(vM.w-.04,vM.w+.04,t);uv=mix(.03,uv,g);
  if(m==2){float bl=1.-smoothstep(.16,.22,t+.05*sin(s*20.));a=mix(a,vec3(.015,.01,.02),bl);uv=mix(uv,.01,bl);}
  a*=mix(.75,1.,smoothstep(0.,.25,t));tr=.75;ro=.55;
 }else if(m==3){ // disc of florets
  vec2 q=vL.xz*vec2(900.);vec2 c=fract(q*mat2(1,.5,0,.866))-.5;float dd=length(c);
  a*=.65+.5*smoothstep(.45,.1,dd);ro=.8;tr=.1;ao=.8;
 }else if(m==4){a*=.8+.4*vnoise(vL.xz*900.);ro=.4;tr=.3;}
 else if(m==5){a*=.85+.25*vnoise(vL.xy*500.);tr=.6;}
 else{a*=.85+.25*vnoise(vec2(t*40.,s*3.));tr=.55;ro=.5;}
 shade(vP,N,a,uv,ro,tr,ao,em);}`;

// ---------------------------------------------------------------- creatures (bee, bee-eater, crab spider)
// per-instance data lives in a float texture: 4 texels model matrix, 2 texels params
export const CRE_VS = `uniform sampler2D uData;uniform int uKind;uniform float uShell;
in vec3 aP,aQ,aN,aV;in vec4 aC,aM;out vec3 vP,vN,vL;out vec4 vC,vM;out float vS;flat out int vK;flat out float vVar;
mat3 ax(vec3 a,float t){a=normalize(a);float c=cos(t),s=sin(t),o=1.-c;
 return mat3(c+a.x*a.x*o,a.y*a.x*o+a.z*s,a.z*a.x*o-a.y*s,a.x*a.y*o-a.z*s,c+a.y*a.y*o,a.z*a.y*o+a.x*s,a.x*a.z*o+a.y*s,a.y*a.z*o-a.x*s,c+a.z*a.z*o);}
void main(){int id=gl_InstanceID;mat4 M=mat4(texelFetch(uData,ivec2(0,id),0),texelFetch(uData,ivec2(1,id),0),texelFetch(uData,ivec2(2,id),0),texelFetch(uData,ivec2(3,id),0));
 vec4 A=texelFetch(uData,ivec2(4,id),0),B=texelFetch(uData,ivec2(5,id),0);
 vK=uKind==0?int(M[0].w+.5):uKind;float gd=M[1].w;M[0].w=0.;M[1].w=0.;vVar=A.z;
 int part=int(aM.z+.5);vec3 p=aP,n=aN;
 if(uKind==0){
  if(part==4){p=mix(aP,aQ,A.y);float li=aM.y;
   // alternating tripod: L1,R2,L3 vs R1,L2,R3. Stance: foot planted, slides back relative to the body; swing: lifts and reaches forward
   float u=fract((B.z+((li==0.||li==3.||li==4.)?0.:3.14159))/6.28318),Am=.06,fz,fy;
   if(u<.5){fz=Am*(1.-4.*u);fy=0.;}else{float s=(u-.5)*2.;fz=-Am+2.*Am*s*s*(3.-2.*s);fy=.045*sin(3.14159*s);}
   float w=smoothstep(.2,1.,aM.x)*A.y*B.w;p.z+=fz*cos(gd)*w;p.x+=fz*sin(gd)*w;p.y+=fy*w;p.x+=sign(p.x)*fy*.25*w;}
  if(part==2||part==8){mat3 r=ax(vec3(0,1,0),A.w*sin(uT*82.)*.32)*ax(vec3(1,0,0),B.x*sin(uT*9.)*.06+A.y*.12-.06);p=aV+r*(p-aV);n=r*n;}
  if(part==6){p=aV+(aQ-aP)*A.y+(aP-aV)*A.z;}
  if(part==7){ // unfolds from under the head (Z-fold), then laps (~5 Hz)
   mat3 r=ax(vec3(1,0,0),(1.-B.y)*2.2);p=aV+r*(p-aV)*(.4+.6*B.y)*(1.-.07*B.y*(.5+.5*sin(uT*31.)));n=r*n;}
  if(part==5&&vK==8)p=aV+(p-aV)*.35;
  if(part==5){mat3 r=ax(vec3(1,0,0),sin(uT*(3.+4.*B.w)+float(id)*1.7+aM.y)*(.15+.12*B.w)+B.y*.3);p=aV+r*(p-aV);n=r*n;}
 }else if(uKind==1){
  if(part==1||part==2){float sg=part==1?1.:-1.;float an=(sin(A.x)*1.1-.1)*(1.-A.y)+A.y*.08;
   mat3 r=ax(vec3(0,0,sg),an);p=aV+r*(p-aV);n=r*n;
   float e=clamp((abs(p.x)-.6)/1.6,0.,1.);mat3 r2=ax(vec3(0,0,sg),an*e*.6);p=aV+r2*(p-aV);}
  if(part==3){mat3 r=ax(vec3(1,0,0),sin(uT*2.)*.05+A.z);p=aV+r*(p-aV);}
 }else if(uKind==5){ // butterfly: big slow strokes; closed upright when perched
  if(part==1||part==2){float sg=part==1?1.:-1.;float an=mix(sin(A.x)*1.05+.3,1.45-.35*A.x,A.y);mat3 r=ax(vec3(0,0,sg),an);p=aV+r*(p-aV);n=r*n;}
 }else if(uKind==6){ // dragonfly: four independently phased wings
  if(part==1||part==2){float sg=part==1?1.:-1.;float an=sin(A.x+aM.w*1.6)*.45;mat3 r=ax(vec3(0,0,sg),an);p=aV+r*(p-aV);n=r*n;}
 }else{if(part==4){float lt=smoothstep(.5,1.,aM.x);p.y+=sin(uT*.6+aM.y*1.7)*.012*lt*step(aM.y,3.5);}}
 if(uKind==0&&part!=4&&part!=6){float sw=sin(B.z)*B.w*A.y;mat3 r=ax(vec3(0,1,0),sw*.06)*ax(vec3(0,0,1),sw*.02);p=r*p;n=r*n;p.y+=abs(cos(B.z))*.006*B.w*A.y;}
 vS=0.;if(uShell>0.){p+=n*uShell*aM.w;vS=uShell;}
 vec4 w=M*vec4(p,1);vP=w.xyz;vN=normalize(mat3(M)*n);vL=p;vC=aC;vM=vec4(aM.xy,float(part),aM.w);
 gl_Position=uVP*w;}`;
export const CRE_FS = `in vec3 vP,vN,vL;in vec4 vC,vM;in float vS;flat in int vK;flat in float vVar;uniform int uKind;uniform float uShell,uShellMax;
float hn(vec3 p){return n3(p*vec3(1));}
void main(){int part=int(vM.z+.5);vec3 N=normalize(vN);vec3 a=vC.rgb;float uv=vC.a,ro=.45,tr=0.,ao=1.;vec3 em=vec3(0);
 if(uShell>0.){ // fur shells: strands thin out towards the tip
  vec2 q=(vL.xy+vL.yz*1.3)*2200.;float h=hash(ivec2(floor(q)))*.6+hash(ivec2(floor(vL.zx*2000.)))*.4;
  if(h<.5+.45*vS/uShellMax||vM.w<=0.)discard;
  a=mix(a*1.2,a*1.6+.03,vS/uShellMax);ro=.9;tr=.4;ao=mix(.5,1.,vS/uShellMax);
 }else if(vK==7||vK==8){ // buff-tailed bumblebee / marmalade hoverfly
  float x=vM.x*5.6,sg=floor(x),fr=x-sg;vec3 bk=vec3(.025,.02,.018);
  if(vK==7){vec3 yl=vec3(.95,.72,.12),wh=vec3(.92,.88,.8);
   if(part==2)a=sg==1.?yl:sg>=4.?wh:bk;if(part==1)a=vL.z>.2?yl:bk;if(part==0||part==4||part==6)a=bk;ro=.8;}
  else{vec3 og=vec3(.95,.55,.08);
   if(part==2)a=mix(og,bk,max(step(.75,fr),step(fr,.08)*step(1.,sg))*step(.5,sg));if(part==1)a=vec3(.12,.1,.05);if(part==4)a=vec3(.75,.6,.2);if(part==0)a=vec3(.85,.7,.4);if(part==6)a=bk;ro=.3;}
  if(part==3){a=vK==8?vec3(.35,.08,.03):vec3(.05,.04,.03);ro=.1;}
  if(part==6){a=vec3(.9,.55,.08)*(.75+.4*n3(vL*900.));ro=.95;}
 }else if(uKind==5){ // butterflies
  if(part==1||part==2){float u=vM.x,v=vM.y;bool top=gl_FrontFacing;tr=.5;ro=.85;
   if(vVar<.5){a=top?vec3(.93,.93,.85):vec3(.86,.88,.62);uv=.05;
    if(vM.w<.5){a=mix(a,vec3(.1),top?smoothstep(.62,.72,u)*smoothstep(.55,.35,v):0.);a=mix(a,vec3(.12),top?smoothstep(.07,.05,length(vec2(u-.58,v-.55))):0.);}
    else a=mix(a,vec3(.15),top?smoothstep(.06,.04,length(vec2(u-.55,v*.6-.02))):0.);}
   else{uv=.1;if(top){a=vec3(.62,.1,.05);
     vec2 e=vM.w<.5?vec2(u-.8,v-.3):vec2(u-.6,v-.55);float r=length(e*vec2(1.,.8));
     if(vM.w<.5)a=r<.16?(r<.06?vec3(.55,.65,.95):r<.1?vec3(.02):vec3(.95,.85,.4)):a;else a=r<.17?(r<.08?vec3(.35,.5,.85):vec3(.03)):a;
     a=mix(a,vec3(.12,.07,.05),smoothstep(.85,.95,v)+smoothstep(.93,1.,u));}
    else a=vec3(.07,.055,.045)*(.8+.4*vnoise(vM.xy*30.));}
   a*=.92+.1*vnoise(vM.xy*vec2(80.,20.));}
  else{ro=.9;}
 }else if(uKind==6){ // dragonfly: glassy wings via alpha-to-coverage
  if(part==1||part==2){float vein=smoothstep(.06,.0,abs(fract(vM.x*14.)-.5)*.5)+smoothstep(.04,0.,abs(vM.y-.15))+smoothstep(.05,0.,vM.y);
   a=mix(vec3(.75,.78,.8),vec3(.1,.08,.06),clamp(vein,0.,1.));ro=.1;shade(vP,N,a,.3,ro,.5,1.,vec3(0));oH.a=oB.a=mix(.18,.9,clamp(vein,0.,1.));return;}
  if(part==3)ro=.08;
 }else if(vK==3||vK==4){ // yellow-legged hornet / European beewolf
  float x=vM.x*5.6,sg=floor(x),fr=x-sg;ro=.35;
  if(vK==3){vec3 dk=vec3(.045,.03,.02),og=vec3(.85,.5,.07);
   if(part==2)a=sg==3.?og:sg>3.?vec3(.25,.12,.03):mix(dk,og*.9,smoothstep(.86,.94,fr));
   if(part==1)a=dk;if(part==0)a=vL.z>.43?og:dk*1.3;if(part==4)a=vM.x>.62?vec3(.92,.78,.18):dk;if(part==6)a=dk;}
  else{vec3 yl=vec3(.95,.78,.06),bk=vec3(.03,.025,.02);
   if(part==2)a=mix(yl,bk,step(fr,.28+.2*(1.-abs(vM.y-.5)*2.)*step(.5,vM.y)));
   if(part==1)a=mix(bk,yl,step(.82,n3(vL*40.)));if(part==0)a=vL.z>.43&&vL.y<.08?yl:bk;if(part==4)a=yl*.9;if(part==6)a=bk;}
  if(part==3){a=vec3(.12,.06,.03);ro=.1;}
 }else if(uKind==0){
  if(part==2){ // abdomen tergites: amber anterior, dark posterior, pale tomentum band
   float x=vM.x*5.6;float sg=floor(x),fr=x-sg;
   vec3 amber=vec3(.55,.3,.06),dark=vec3(.06,.04,.025);
   a=sg<2.?mix(amber,dark,smoothstep(.55,.8,fr)):mix(dark*1.3,dark,fr);
   if(sg>=1.&&sg<5.)a=mix(a,vec3(.26,.2,.13),smoothstep(.0,.06,fr)*smoothstep(.22,.1,fr)*.45*(.6+.4*hash(ivec2(vL.xy*3000.))));
   a*=.9+.2*hash(ivec2(vL.xz*2500.));
   ro=.5;}
  if(part==6){a=vec3(.95,.58,.08)*(.72+.45*n3(vL*1100.))*(.9+.1*n3(vL*300.));ro=.95;uv=.03;}
  if(part==7){ro=.25;}
  if(part==3){ // compound eye: hex facets, hairs between facets
   vec2 q=vM.xy*vec2(70.,40.);q=q*mat2(1,0,.5,.866);vec2 c=fract(q)-.5;float wall=smoothstep(.36,.5,max(abs(c.x),abs(c.y)));
   a=mix(vec3(.05,.035,.02),vec3(.11,.08,.05),wall);ro=mix(.06,.5,wall);uv=.08;}
 }else if(uKind==2){tr=.55;ro=.4;a*=.93+.1*vnoise(vL.xz*300.)+.04*vnoise(vL.xy*900.);if(part==3){ro=.05;tr=0.;}
 }else if(uKind==1){ro=.6;if(part==1||part==2||part==3){float f=fract(vM.x*(part==3?6.:11.));a*=.78+.22*smoothstep(0.,.25,f)*smoothstep(1.,.8,f);a*=.9+.1*vnoise(vM.xy*vec2(60.,8.));ro=.45;}
  else a*=.92+.12*vnoise(vL.xz*900.+vL.y*300.);}
 shade(vP,N,a,uv,ro,tr,ao,em);}`;

// ---------------------------------------------------------------- wings (instanced blur fans)
export const WING_VS = `uniform sampler2D uData;uniform int uK;uniform float uSpan;
in vec3 aP;in vec2 aW;out vec3 vP,vN;out vec2 vW;out float vA,vLand;flat out int vHind,vK;
mat3 ax(vec3 a,float t){a=normalize(a);float c=cos(t),s=sin(t),o=1.-c;
 return mat3(c+a.x*a.x*o,a.y*a.x*o+a.z*s,a.z*a.x*o-a.y*s,a.x*a.y*o-a.z*s,c+a.y*a.y*o,a.z*a.y*o+a.x*s,a.x*a.z*o+a.y*s,a.y*a.z*o-a.x*s,c+a.z*a.z*o);}
void main(){int bee=gl_InstanceID/(4*uK),wi=(gl_InstanceID/uK)%4,k=gl_InstanceID%uK;
 mat4 M=mat4(texelFetch(uData,ivec2(0,bee),0),texelFetch(uData,ivec2(1,bee),0),texelFetch(uData,ivec2(2,bee),0),texelFetch(uData,ivec2(3,bee),0));
 vec4 A=texelFetch(uData,ivec2(4,bee),0);vK=int(M[0].w+.5);M[0].w=0.;M[1].w=0.;
 float sd=(wi&1)==0?1.:-1.;bool hind=wi>1;float L=hind?.5:.78;
 vec3 p=vec3(aP.x*L,0,aP.z*L*(hind?.2:.17));
 float ph=A.x+(float(k)+.5)/float(uK)*6.2832*uSpan;
 float sweep=sin(ph)*1.05+.25,pitch=cos(ph)*.75,elev=sin(ph*2.)*.15+.1;
 float land=A.y;sweep=mix(sweep,1.42,land);pitch=mix(pitch,0.,land);elev=mix(elev,-.03,land);
 mat3 r=ax(vec3(0,1,0),sweep)*ax(vec3(0,0,1),elev)*ax(vec3(1,0,0),pitch);
 vec3 q=r*p;q.x*=sd;vec3 wn=r*vec3(0,1,0);wn.x*=sd;q+=vec3(sd*.07,hind?.11:.12,hind?-.04:.03)+vec3(0,land*(hind?.0:.012),0);
 vec4 w=M*vec4(q,1);vP=w.xyz;vN=normalize(mat3(M)*wn);vW=aW;vLand=land;vA=mix(uK>1?2.2/float(uK):1.,1.,land);vHind=hind?1:0;
 gl_Position=(land>.5&&k>0)||(vK==8&&hind)?vec4(0,0,-2,1):uVP*w;}`;
export const WING_FS = `in vec3 vP,vN;in vec2 vW;in float vA,vLand;flat in int vHind,vK;
void main(){float s=vW.x,c=vW.y;
 float lim=vHind==1?.5*sqrt(max(1.-pow((s-.5)/.52,2.),0.))*(1.-.3*s):.5*sqrt(max(1.-pow((s-.47)/.53,2.),0.))*(1.-.25*s);
 float cd=c+(vHind==1?.0:.06*s);if(abs(cd)>lim)discard;
 float vein=0.;vein+=smoothstep(.04,0.,abs(cd-lim*.8))*step(s,.7);
 vein+=smoothstep(.02,0.,abs(cd-lim*.1-.05*sin(s*5.)))*step(s,.62);
 vein+=smoothstep(.015,0.,abs(s-.62+cd*.6))*step(abs(cd),lim*.8)*(vHind==1?0.:1.);
 vein+=smoothstep(.015,0.,abs(cd+lim*.4+.1*s))*step(s,.55);
 vein=clamp(vein,0.,1.)*step(.02,s);
 vec3 V=normalize(uCam-vP);vec3 N=normalize(vN);float mu=abs(dot(N,V));
 vec3 ir=.5+.5*cos(6.2832*(mu*1.7+vec3(0,.33,.67)+s*.4));
 vec3 Hh=normalize(uSun+V);float sp=pow(abs(dot(N,Hh)),120.)*3.;
 vec3 base=mix(vK==3?vec3(.55,.38,.15):vK==7?vec3(.35,.32,.3):vec3(.5,.5,.48),vec3(.16,.1,.06),vein);
 vec3 h=base*(uSunC*.35+uSkyZ*.6+uLampC*.3)+ir*(uSunC+uLampC)*.025*(1.-vein)+uSunC*sp*.5;
 vec3 b=band(base,.3)*(uBSun*.35+uBSkyZ*.6+band(uLampC,.1)*.3)+band(ir,ir.b)*uBSun*.12+uBSun*sp*.5;
 float al=mix(.06+.16*(1.-mu),.65,vein)*vA*mix(1.,.6,vHind==1?1.:.0)*(1.-.35*smoothstep(.5,1.,vLand));fog(h,b,vP);
 oH=vec4(h*al,al);oB=vec4(b*al,al);}`;

// ---------------------------------------------------------------- static meshes (hive box, stand, comb frame)
export const STAT_VS = `in vec3 aP,aN;in vec4 aC,aM;uniform mat4 uM;out vec3 vP,vN,vL;out vec4 vC,vM;
void main(){vec4 w=uM*vec4(aP,1);vP=w.xyz;vN=mat3(uM)*aN;vL=aP;vC=aC;vM=aM;gl_Position=uVP*w;}`;
export const STAT_FS = `in vec3 vP,vN,vL;in vec4 vC,vM;
void main(){vec3 N=normalize(vN);int m=int(vM.z+.5);vec3 a=vC.rgb;float uv=vC.a,ro=.8,ao=1.;
 vec3 q=vL*vec3(1);
 if(m==0||m==3){ // painted / bare wood with grain and chipped paint
  float g=vnoise(vec2(dot(q,vec3(1,0,1))*3.,q.y*90.+vnoise(q.xz*20.)*3.));
  vec3 wood=mix(vec3(.35,.25,.15),vec3(.5,.38,.24),g);
  float chip=smoothstep(.66,.7,fbm(vec2(q.x+q.z,q.y)*70.,3))*smoothstep(.3,.6,vnoise(vec2(q.x+q.z,q.y)*9.));
  a=m==3?wood:mix(a*(.9+.1*g),wood,chip);uv=m==3?.04:mix(uv,.04,chip);ro=.7;
  float seam=smoothstep(.003,.0,abs(fract(q.y/.244+.02)-.02));a*=1.-.5*seam;}
 else if(m==1){a*=.85+.15*vnoise(q.xz*40.);ro=.35;}
 else if(m==2){a=vec3(.004);ao=.2;}
 else if(m==4){a*=.75+.35*vnoise(q.xy*60.+q.z*20.);ro=.95;}
 shade(vP,N,a,uv,ro,0.,ao,vec3(0));}`;

// ---------------------------------------------------------------- comb: instanced hexagonal cells
// state: 0 empty, 1 nectar, 2 capped honey, 3 capped brood, 4 larva, 5 pollen, 6 egg
export const COMB_VS = `in vec3 aP,aN;in vec4 aM;uniform mat4 uM;uniform int uCols;uniform float uW;
out vec3 vP,vN,vL;out vec4 vM;flat out int vSt;flat out float vR;
void main(){int c=gl_InstanceID%uCols,r=gl_InstanceID/uCols;
 vec2 g=vec2(float(c)+.5*float(r&1),float(r)*.866)*uW;ivec2 ci=ivec2(c,r);
 vec2 e=(g-vec2(float(uCols)*uW*.5,float(uCols)*uW*.34))/vec2(.15,.10);float rr=length(e);
 float h1=hash(ci),h2=hash(ci+ivec2(9,1));int st=0;
 float j=rr+(vnoise(g*30.)-.5)*.4;
 if(j<.62)st=h1<.86?3:h1<.95?4:6;else if(j<.86)st=h1<.75?5:1;else if(j<1.25)st=h1<.55?2:1;else st=h1<.2?1:0;
 if(h2<.04)st=0;
 int part=int(aM.z+.5);vec3 p=aP;
 if(part==1&&st!=2&&st!=3)p=vec3(0);
 if(part==2&&st!=1&&st!=5)p=vec3(0);
 if(part==2)p.z+=(st==5?-.55:-.25+.15*h2)*uW*2.;
 if(part==3&&st!=4)p=vec3(0);
 if(part==4&&st!=6)p=vec3(0);
 if(part==1&&st==3)p.z+=.05*uW*(1.-dot(p.xy,p.xy)/(uW*uW*.25));
 p.xy+=g;vec4 w=uM*vec4(p,1);vP=w.xyz;vN=mat3(uM)*aN;vL=aP;vM=aM;vSt=st;vR=h1+h2*3.;gl_Position=uVP*w;}`;
export const COMB_FS = `in vec3 vP,vN,vL;in vec4 vM;flat in int vSt;flat in float vR;
void main(){vec3 N=normalize(vN);int part=int(vM.z+.5);vec3 a;float ro=.5,tr=.3,uv=.05,ao=1.;vec3 em=vec3(0);
 if(part==0){a=vSt==3||vSt==4||vSt==6?vec3(.32,.2,.08):vec3(.75,.6,.25);ro=.35;tr=.5;ao=mix(.25,1.,vM.y);}
 else if(part==1){if(vSt==2){a=vec3(.85,.78,.55);ro=.6;}else{a=vec3(.55,.38,.18)*(.85+.3*vnoise(vL.xy*4000.));ro=.85;}tr=.4;}
 else if(part==2){if(vSt==5){float k=fract(vR*7.31);a=k<.3?vec3(.9,.55,.05):k<.55?vec3(.85,.75,.1):k<.75?vec3(.6,.25,.05):k<.9?vec3(.5,.55,.15):vec3(.3,.25,.3);ro=.9;uv=k<.55?.02:.15;}
  else{a=vec3(.5,.25,.03);ro=.05;tr=.9;em=vec3(.0);}}
 else if(part==3){a=vec3(.92,.9,.82);ro=.12;tr=.7;}
 else{a=vec3(.95);ro=.3;}
 shade(vP,N,a,uv,ro,tr,ao,em);}`;

// ---------------------------------------------------------------- trees
export const TREE_VS = `in vec3 aP,aN;in vec4 aM;in vec4 iA;in float iS;out vec3 vP,vN,vL;out vec4 vM;
void main(){vec3 p=aP*iS;mat2 r=rot(iA.w);p.xz=r*p.xz;vec3 n=aN;n.xz=r*n.xz;
 float k=max(p.y-1.,0.)*.02;vec2 w=wind(iA.xz)*k*(1.+.5*sin(uT*1.5+aM.w*6.));
 if(aM.z>.5)w+=vec2(sin(uT*4.+aM.w*30.),cos(uT*3.3+aM.w*20.))*.05;
 p.xz+=w;vP=iA.xyz+p;vN=n;vL=aP;vM=aM;gl_Position=uVP*vec4(vP,1);}`;
export const TREE_FS = `in vec3 vP,vN,vL;in vec4 vM;
void main(){vec3 N=normalize(gl_FrontFacing?vN:-vN);
 if(vM.z<.5){float b=vnoise(vec2(atan(vL.x,vL.z)*6.,vL.y*4.))*.6+vnoise(vec2(atan(vL.x,vL.z)*20.,vL.y*12.))*.4;
  vec3 a=mix(vec3(.12,.1,.08),vec3(.3,.28,.24),b);shade(vP,N,a,.03,.95,0.,.8,vec3(0));return;}
 vec2 u=vM.xy;float m=0.;
 for(int i=0;i<5;i++){vec2 c=vec2(hash(ivec2(i,int(vM.w*999.))),hash(ivec2(i+7,int(vM.w*777.))))*.6+.2;float an=float(i)*2.4+vM.w*10.;
  vec2 q=rot(an)*(u-c);q.y*=2.;float lob=.22+.05*sin(q.x*40.);m=max(m,1.-length(q)/lob);}
 if(m<.02)discard;
 float hv=hash(ivec2(int(vM.w*5000.),3));vec3 a=mix(vec3(.05,.12,.02),vec3(.15,.25,.05),hv)*(.7+.5*m);
 shade(vP,N,a,.02,.6,.7,mix(.4,1.,clamp(vL.y*.08+.2,0.,1.)),vec3(0));oH.a=clamp(m*8.,0.,1.);}`;

// ---------------------------------------------------------------- particles (pollen motes, dust)
export const PART_VS = `in vec4 aP;uniform float uSz;out float vA;
void main(){vec3 p=uCam+mod(aP.xyz+vec3(wind(aP.xz).x,sin(uT*.3+aP.w*9.)*.2,wind(aP.xz).y)*uT*.15-uCam+3.,6.)-3.;
 vec4 c=uVP*vec4(p,1);gl_Position=c;gl_PointSize=uSz*(.4+aP.w)/max(c.w,.05);vA=.5+.5*sin(uT*2.+aP.w*30.);}`;
export const PART_FS = `in float vA;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,.0,length(c))*vA*.5;
 vec3 h=(uSunC*.4+uLampC*2.)*vec3(1,.9,.6)*a;oH=vec4(h,a);oB=vec4(band(h,h.b*.3),a);}`;

// ---------------------------------------------------------------- depth-only variants for the shadow pass
export const DEPTH_FS = `out vec4 o;void main(){o=vec4(1);}`;

// ---------------------------------------------------------------- post
export const FS_VS = `in vec2 aP;out vec2 vU;void main(){vU=aP*.5+.5;gl_Position=vec4(aP,0,1);}`;
export const COMBINE_FS = `in vec2 vU;uniform sampler2D uH,uB,uD;uniform float uVis,uExp,uWipe,uAsp;out vec4 o;
void main(){vec3 h=texture(uH,vU).rgb,b=texture(uB,vU).rgb;
 // bee false colour: green receptor->yellow-green, blue->blue, UV->violet (von Kries-adapted bands)
 vec3 bc=b.r*vec3(.62,.72,.08)+b.g*vec3(.05,.32,.95)+b.b*vec3(.55,.0,.62)*.8;
 vec2 q=(vU-.5)*vec2(uAsp,1)*28.;q=q*mat2(1,0,-.577,1.155);vec2 c=floor(q);float hx=hash(ivec2(c));
 float m=smoothstep(uWipe-.08,uWipe+.08,uVis*1.16-hx*.16-length(vU-.5)*.0);
 vec3 col=mix(h,bc,clamp(m,0.,1.));float d=texture(uD,vU).r;
 o=vec4(min(col*uExp,vec3(40.)),d>=1.?1.:0.);}`;
export const FINAL_FS = `in vec2 vU;uniform sampler2D uC,uD;uniform float uAsp,uFoc,uAp,uNear,uFar,uEye,uBars,uT2,uFade,uGrain,uSat,uWarm,uLevels;uniform vec2 uSunS;uniform float uRays,uBE;out vec4 o;
float lin(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 samp(vec2 u,float l){return textureLod(uC,u,l).rgb;}
void main(){vec2 u=vU;
 vec2 cen=u-.5;
 if(uEye>0.){u=.5+cen*(1.-uEye*.18*dot(cen,cen)*4.);}  // slight fish-eye
 vec3 col;float facet=1.;
 if(uBE>0.){ // seen THROUGH her two compound eyes: each eye is a curved hex-faceted dome sampling its side of the
  // field (small frontal overlap); facets are little lenses; the hairy head frames them
  vec2 a=(vU-.5)*vec2(uAsp,1.);float sd=a.x<0.?-1.:1.;
  vec2 c=vec2(sd*uAsp*.245,.02),rr=vec2(uAsp*.265,.52),el=(a-c)/rr;el.x+=sd*.06*el.y*el.y;float dE=length(el);
  float n=46.;vec2 q=el*n/(1.+.35*dE*dE);vec2 r1=vec2(1,1.732),hh=r1*.5;
  vec2 g1=mod(q,r1)-hh,g2=mod(q-hh,r1)-hh;vec2 g=dot(g1,g1)<dot(g2,g2)?g1:g2;
  vec2 ec=(q-g)/n*(1.+.35*dE*dE);float e2=dot(ec,ec);
  vec2 su=vec2(.5+sd*.26+ec.x*.3*(1.+.3*e2),.5+ec.y*.5*(1.+.25*e2));
  float lod=log2(uLevels/(n*2.2))+.4;col=samp(su,lod)*.75+samp(su,lod+1.)*.25;
  float lens=exp(-dot(g,g)*2.6)*1.2+smoothstep(.22,.0,length(g-vec2(-.18,.2)))*.12*(1.-dE*.5);
  float wall=smoothstep(.42,.5,max(abs(g.x)*1.,abs(dot(g,vec2(.5,.866)))));
  col*=lens*(1.-.55*wall)*smoothstep(1.02,.7,dE);
  float hair=vnoise(a*vec2(260.,40.)*rot(sd*.6+a.y))*.6+vnoise(a*900.)*.4;
  vec3 head=vec3(.03,.022,.014)*(.5+hair)*(1.+.6*smoothstep(1.25,1.,dE));
  col=mix(head,col,smoothstep(1.03,.98,dE));u=su;facet=1.;
 }else if(uEye>0.){float n=mix(400.,105.,uEye);vec2 q=u*vec2(uAsp,1)*n;
  vec2 a=vec2(q.x,q.y*1.1547-q.x*.0);vec2 r1=vec2(1,1.732);vec2 hh=r1*.5;
  vec2 g1=mod(q,r1)-hh,g2=mod(q-hh,r1)-hh;vec2 g=dot(g1,g1)<dot(g2,g2)?g1:g2;
  vec2 cc=(q-g)/n/vec2(uAsp,1);float lod=log2(uLevels/n)+mix(-.6,.6,uEye);
  col=samp(cc,lod)*.7+samp(cc,lod+1.)*.3;
  facet=mix(1.,exp(-dot(g,g)*3.2)*1.25,uEye);u=cc;}
 else{float d=lin(texture(uD,u).r);float coc=clamp(abs(d-uFoc)/d*uAp,0.,1.);
  col=samp(u,0.);if(coc>.02){vec3 s=vec3(0);float w=0.;float rad=coc*.035;
   for(int i=0;i<20;i++){float r=sqrt(float(i)+.5)/4.47,t=float(i)*2.39996;vec2 o2=vec2(cos(t),sin(t))*r*rad*vec2(1./uAsp,1);
    float dt=lin(texture(uD,u+o2).r),ct=clamp(abs(dt-uFoc)/dt*uAp,0.,1.);float wt=dt<d?clamp(ct/coc*1.5,0.,1.):1.;
    s+=samp(u+o2,log2(1.+min(coc,max(ct,.02))*.035*uLevels/5.))*wt;w+=wt;}col=mix(col,s/max(w,.001),smoothstep(.02,.15,coc)*step(.001,w));}}
 vec3 bl=samp(u,2.)*.4+samp(u,4.)*.35+samp(u,6.)*.25;col+=max(bl-1.2,0.)*.3+bl*.012;
 if(uRays>0.){vec2 dl=(uSunS-vU)/40.;vec2 p=vU;float s=0.;float dec=1.;
  for(int i=0;i<40;i++){p+=dl;s+=textureLod(uC,p,4.).a*dec*dot(textureLod(uC,p,4.).rgb,vec3(.3));dec*=.965;}
  col+=s*uRays*vec3(1,.85,.6)*.02;}
 col*=facet;
 col=aces(col);float l=dot(col,vec3(.3,.59,.11));col=mix(vec3(l),col,uSat);
 col*=mix(vec3(1),vec3(1.06,1.,.9),uWarm);
 col=pow(col,vec3(1./2.2));
 col*=1.-.32*pow(length(cen*vec2(1.2,1.)),2.4)*2.;
 col+=(hash(ivec2(gl_FragCoord.xy)+ivec2(int(uT2*997.)%999))-.5)*uGrain;
 if(abs(cen.y)>.5-uBars)col=vec3(0);
 o=vec4(col*uFade,1);}`;
