// Mittelalterliche Musik und Geräusche, komplett synthetisiert (keine Audiodateien).
// Stimmungen: menu, taverne (Wetten), schlacht (Angriff), finale (Duell mit Herzschlag), koenig (Krönung), still.
// Abgemischt für Handylautsprecher: kein tiefer Bass unter ~90 Hz, dafür Obertöne und Mitten.

export function createAudio(ac,dest){
  const now=()=>ac.currentTime;
  const master=ac.createGain();master.gain.value=.8;
  const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=85;hp.Q.value=.7;
  const pres=ac.createBiquadFilter();pres.type='peaking';pres.frequency.value=2600;pres.gain.value=3;pres.Q.value=.8;
  const comp=ac.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=8;comp.ratio.value=5;comp.attack.value=.004;comp.release.value=.2;
  const lim=ac.createDynamicsCompressor();lim.threshold.value=-2;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.001;lim.release.value=.08;
  master.connect(hp);hp.connect(pres);pres.connect(comp);comp.connect(lim);lim.connect(dest);
  // Hall: kurzer Saal aus abklingendem Rauschen
  const rev=ac.createConvolver();{const sr=ac.sampleRate,L=Math.floor(sr*1.9),b=ac.createBuffer(2,L,sr);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<L;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/L,3.2)*(i<sr*.012?i/(sr*.012):1);}rev.buffer=b;}
  const revOut=ac.createGain();revOut.gain.value=.55;rev.connect(revOut);revOut.connect(master);
  const mus=ac.createGain(),musIn=ac.createGain(),fx=ac.createGain(),musRev=ac.createGain(),fxRev=ac.createGain();
  mus.gain.value=.55;musIn.gain.value=1;fx.gain.value=1;musRev.gain.value=.35;fxRev.gain.value=.22;
  musIn.connect(mus);mus.connect(master);mus.connect(musRev);musRev.connect(rev);fx.connect(master);fx.connect(fxRev);fxRev.connect(rev);
  // Verzerrung für Brüllen, Explosionen und Bass-Obertöne
  const curve=k=>{const n=1024,c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;c[i]=Math.tanh(x*k);}return c;};
  const noiseBuf=(()=>{const L=ac.sampleRate*2,b=ac.createBuffer(1,L,ac.sampleRate),d=b.getChannelData(0);for(let i=0;i<L;i++)d[i]=Math.random()*2-1;return b;})();
  const brownBuf=(()=>{const L=ac.sampleRate*2,b=ac.createBuffer(1,L,ac.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<L;i++){l=(l+.02*(Math.random()*2-1))/1.02;d[i]=l*3.5;}return b;})();

  /* ---------- Bausteine ---------- */
  const G=(v=0)=>{const g=ac.createGain();g.gain.value=v;return g;};
  const env=(g,t,a,peak,d,sus=0,rel=0)=>{const p=g.gain;p.cancelScheduledValues(t);p.setValueAtTime(0,t);p.linearRampToValueAtTime(peak,t+a);
    if(rel){p.setTargetAtTime(sus,t+a,d/3);p.setTargetAtTime(0,t+a+d,rel/3);}else p.exponentialRampToValueAtTime(.0001,t+a+d);};
  const osc=(type,f,t,dur,out,{det=0}={})=>{const o=ac.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.detune.value=det;o.connect(out);o.start(t);o.stop(t+dur+.05);return o;};
  const noise=(t,dur,out,{brown=false,rate=1}={})=>{const s=ac.createBufferSource();s.buffer=brown?brownBuf:noiseBuf;s.playbackRate.value=rate;s.loop=true;s.connect(out);s.start(t,Math.random()*1.5);s.stop(t+dur+.05);return s;};
  const filt=(type,f,q=1,out)=>{const b=ac.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;if(out)b.connect(out);return b;};
  const pan=(p,out)=>{if(!ac.createStereoPanner)return out;const s=ac.createStereoPanner();s.pan.value=p;s.connect(out);return s;};
  const shaper=(k,out)=>{const w=ac.createWaveShaper();w.curve=curve(k);w.oversample='2x';w.connect(out);return w;};
  const N=m=>440*Math.pow(2,(m-69)/12);

  /* ---------- Instrumente ---------- */
  // Laute: gezupft, zwei leicht verstimmte Saiten, heller Anschlag der schnell weich wird
  function lute(t,m,v=.2,dur=.6,out=musIn,p=0){const g=G(),f=filt('lowpass',3800,1.2,g);g.connect(pan(p,out));
    f.frequency.setValueAtTime(4200,t);f.frequency.exponentialRampToValueAtTime(700,t+dur*.6);
    osc('sawtooth',N(m),t,dur,f,{det:-4});osc('triangle',N(m),t,dur,f,{det:5});osc('square',N(m+12),t,.05,f).detune.value=3;env(g,t,.004,v,dur);}
  // Blockflöte: Sinus mit Vibrato und Atemgeräusch
  function flute(t,m,v=.12,dur=.4,out=musIn){const g=G();g.connect(pan(.25,out));const o=osc('sine',N(m),t,dur,g),lfo=ac.createOscillator(),lg=G(N(m)*.012);
    lfo.frequency.value=5.5;lfo.connect(lg);lg.connect(o.frequency);lfo.start(t+.08);lfo.stop(t+dur+.05);
    const ng=G(),nf=filt('bandpass',N(m)*2,3,ng);ng.connect(g);noise(t,dur,nf);env(ng,t,.02,.35,dur*.4);
    env(g,t,.035,v,dur*.85,v*.8,.08);}
  // Dudelsack-Bordun: Sägezähne durch Tiefpass, sehr leise im Hintergrund
  function drone(t,m,dur,v=.05,out=musIn){const g=G(),f=filt('lowpass',900,2,g);g.connect(out);[0,7,12].forEach((d,i)=>osc('sawtooth',N(m+d),t,dur,f,{det:i*3-3}));env(g,t,.4,v,dur,v,.4);}
  // Rahmentrommel / Tamburin
  function frame(t,v=.25,out=musIn){const g=G(),f=filt('bandpass',220,1.4,g);g.connect(out);const o=osc('sine',180,t,.25,f);o.frequency.exponentialRampToValueAtTime(90,t+.2);env(g,t,.002,v,.22);
    const ng=G(),nf=filt('highpass',6000,.7,ng);ng.connect(out);noise(t,.12,nf);env(ng,t,.001,v*.25,.09);}
  function jingle(t,v=.07,out=musIn){const ng=G(),nf=filt('bandpass',8500,2,ng);ng.connect(pan(-.3,out));noise(t,.2,nf);env(ng,t,.002,v,.16);}
  // Kriegstrommel: tiefer Schlag mit kräftigen Obertönen (hörbar auf kleinen Lautsprechern)
  function wardrum(t,v=.5,pitch=110,out=musIn){const g=G();g.connect(out);const sh=shaper(2.5,g);const o=osc('sine',pitch*1.6,t,.5,sh);o.frequency.exponentialRampToValueAtTime(pitch,t+.12);
    osc('triangle',pitch*2.4,t,.15,sh).frequency.exponentialRampToValueAtTime(pitch*1.2,t+.1);env(g,t,.002,v,.45);
    const ng=G(),nf=filt('lowpass',1800,.8,ng);ng.connect(out);noise(t,.15,nf);env(ng,t,.001,v*.5,.12);}
  // Chor „Aaah“: verstimmte Sägezähne durch drei Formanten
  function choir(t,notes,dur,v=.08,out=musIn,vowel='a'){const F={a:[800,1150,2900],o:[450,800,2830],u:[325,700,2530]}[vowel];const g=G();g.connect(out);
    const fs=F.map((f,i)=>{const b=filt('bandpass',f,i?9:6,null);b.connect(g);return b;});
    for(const m of notes)for(const d of [-8,0,9]){const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=N(m);o.detune.value=d;const lfo=ac.createOscillator(),lg=G(4);lfo.frequency.value=4.6+Math.random();lfo.connect(lg);lg.connect(o.detune);
      fs.forEach(b=>o.connect(b));o.start(t);o.stop(t+dur+.6);lfo.start(t);lfo.stop(t+dur+.6);}
    env(g,t,.25,v,dur,v*.9,.5);}
  // Blechbläser: Sägezahn, Filter öffnet beim Ansatz
  function brass(t,m,dur,v=.14,out=musIn,p=0){const g=G(),f=filt('lowpass',600,2.5,g);g.connect(pan(p,out));
    f.frequency.setValueAtTime(500,t);f.frequency.linearRampToValueAtTime(N(m)*7,t+.06);f.frequency.setTargetAtTime(N(m)*4,t+.08,.15);
    osc('sawtooth',N(m),t,dur,f,{det:-5});osc('sawtooth',N(m),t,dur,f,{det:6});env(g,t,.03,v,dur,v*.75,.12);}
  // Glocke: unharmonische Teiltöne
  function bell(t,m,v=.2,out=fx,dur=3.2){const g=G();g.connect(out);[[1,1],[2,.5],[2.76,.35],[5.4,.22],[8.93,.12],[.5,.4]].forEach(([r,a])=>{const gg=G(a);gg.connect(g);osc('sine',N(m)*r,t,dur,gg);});env(g,t,.002,v,dur);}

  /* ---------- Musik-Sequenzer ---------- */
  // D-Dorisch. Taverne im 6/8-Takt, Schlacht in 4/4 mit Trommeln, König als Fanfare.
  const TAV=[[62,69,74],[60,67,72],[62,69,74],[57,64,69]],TAVM=[74,76,77,76,74,72,74,69, 72,74,76,74,72,71,72,67, 74,76,77,79,81,79,77,76, 74,72,71,69,67,69,74,74];
  let musOn=true,mood='still',nextT=0,step=0,timer=null,E=0,lastMood='';
  const BPM={menu:96,taverne:132,schlacht:96,finale:60,koenig:104,still:90};
  function schedule(){const t0=now();if(nextT<t0)nextT=t0+.05;if(nextT>t0+1)nextT=t0+.05;
    while(nextT<t0+.25){play(nextT,step);const spb=60/BPM[mood];nextT+=mood==='taverne'?spb/3*2:spb/4;step++;}}
  function play(t,s){
    if(mood==='menu'){const bar=Math.floor(s/16)%4,k=s%16,ch=TAV[bar];
      if(k===0)drone(t,ch[0]-24,2.6,.035);if(k%4===0)lute(t,ch[(k/4)%3]+(k===12?12:0),.12,.9);if(k===6&&bar%2)lute(t,ch[2]+12,.07,.8);}
    else if(mood==='taverne'){const bar=Math.floor(s/12)%4,k=s%12,ch=TAV[bar];
      if(k===0)drone(t,ch[0]-24,2.3,.04);
      if(k%3===0)lute(t,ch[(k/3)%3]+(k===9?12:0),.14,.4,musIn,-.2);if(k===0||k===6)frame(t,.22);if(k===3||k===9)frame(t,.1);if(k%3===2)jingle(t,.05);
      if(k%3===0){const m=TAVM[(Math.floor(s/3))%TAVM.length];flute(t,m+12,.07,.32);}}
    else if(mood==='schlacht'){const k=s%16,bar=Math.floor(s/16)%4,root=[50,48,46,45][bar];
      if(k===0){drone(t,root-12,2.5,.045);choir(t,[root,root+7,root+12],2.3,.05+E*.03,musIn,bar%2?'o':'a');}
      if([0,3,6,8,10,12,13,14,15].includes(k)&&(k<12||E>.4))wardrum(t,k===0||k===8?.42:.22,k%8===0?95:130);
      if(k===0||k===8)brass(t,root+12,.18,.08+E*.06,musIn,-.2);if(k===10)brass(t,root+15,.12,.07+E*.05,musIn,.2);if(k===12)brass(t,root+14,.4,.07+E*.05);}
    else if(mood==='finale'){const k=s%16;if(k===0){drone(t,38,4,.05);choir(t,[50,53,57],3.6,.05,musIn,'u');}
      if(k===0||k===3){const g=G();g.connect(musIn);const sh=shaper(2,g);const o=osc('sine',k?75:85,t,.3,sh);o.frequency.exponentialRampToValueAtTime(48,t+.2);env(g,t,.004,k?.32:.42,.24);}}
    else if(mood==='koenig'){const k=s%16,bar=Math.floor(s/16)%4,ch=[[62,66,69],[67,71,74],[62,66,69],[69,73,76]][bar];
      if(k===0){drone(t,ch[0]-24,2.6,.04);choir(t,ch.map(x=>x-12),2.4,.05);}
      if(k%4===0)wardrum(t,k===0?.32:.18,140);if(k===0||k===6||k===8||k===12)brass(t,ch[(k/4|0)%3]+(k===12?12:0),k===6?.12:.3,.11);
      if(k%2===0)lute(t,ch[(k/2)%3]+12,.07,.3);if(k===0&&bar===0)bell(t,74,.1,musIn,3);}
  }
  function setMood(m,energy){if(energy!=null)E=energy;if(m===mood)return;mood=m;
    if(m!==lastMood){musIn.gain.cancelScheduledValues(now());musIn.gain.setValueAtTime(.0001,now());musIn.gain.exponentialRampToValueAtTime(1,now()+.35);lastMood=m;}
    step=0;nextT=now()+.08;}
  function start(){if(!timer)timer=setInterval(schedule,40);}
  function stop(){clearInterval(timer);timer=null;}

  /* ---------- Geräusche ---------- */
  const sfx={
    click(t=now()){const g=G();g.connect(fx);osc('triangle',1300,t,.05,g);env(g,t,.001,.08,.04);},
    tick(t=now(),hi=false){const g=G();g.connect(fx);const f=filt('bandpass',hi?2400:1700,6,g);noise(t,.05,f);env(g,t,.001,hi?.5:.3,.04);},
    // Ziegel: mehrere klackernde Steine, Kelle, dumpfes Aufsetzen
    build(t=now()){for(let i=0;i<9;i++){const tt=t+i*.13+Math.random()*.05,g=G(),f=filt('bandpass',1400+Math.random()*1400,7,g);g.connect(pan(Math.random()-.5,fx));noise(tt,.05,f);env(g,tt,.001,.55,.05);
        const g2=G();g2.connect(fx);osc('square',300+Math.random()*250,tt,.04,filt('lowpass',900,1,g2));env(g2,tt,.001,.12,.03);}
      for(let i=0;i<3;i++){const tt=t+.35+i*.4,g=G();g.connect(fx);const o=osc('triangle',180,tt,.15,g);o.frequency.exponentialRampToValueAtTime(110,tt+.1);env(g,tt,.002,.35,.12);}
      const sg=G(),sf=filt('bandpass',3500,2,sg);sg.connect(fx);noise(t+.6,.4,sf);env(sg,t+.6,.05,.08,.35);
      sfx.stone(t+1.35,.6);},
    stone(t=now(),v=1){const g=G();g.connect(fx);const sh=shaper(2,g);const o=osc('sine',140,t,.3,sh);o.frequency.exponentialRampToValueAtTime(70,t+.2);env(g,t,.002,.45*v,.25);
      const ng=G(),nf=filt('lowpass',2500,1,ng);ng.connect(fx);noise(t,.25,nf);env(ng,t,.002,.4*v,.2);},
    bet(t=now()){const g=G();g.connect(fx);[0,.06].forEach((d,i)=>{const gg=G();gg.connect(g);osc('sine',[1568,2093][i],t+d,.4,gg);env(gg,t+d,.002,.25,.35);});g.gain.value=1;},
    coin(t=now()){[0,.07,.14].forEach(d=>{const g=G();g.connect(fx);osc('square',2600+Math.random()*400,t+d,.08,filt('highpass',2000,1,g));env(g,t+d,.001,.08,.07);});},
    drum(t=now(),v=1){wardrum(t,.6*v,100,fx);},
    horn(t=now(),dur=1.1){brass(t,57,dur*.35,.22,fx);brass(t+dur*.4,62,dur*.6,.25,fx);brass(t+dur*.4,69,dur*.6,.12,fx);},
    fanfare(t=now()){[[62,0,.18],[66,.2,.18],[69,.4,.18],[74,.6,.9]].forEach(([m,d,l])=>{brass(t+d,m,l,.2,fx,-.2);brass(t+d,m+4,l,.12,fx,.2);});wardrum(t+.6,.5,100,fx);[0,.6].forEach(d=>sfx.cymbal(t+d+.6));},
    cymbal(t=now()){const g=G(),f=filt('highpass',5000,.6,g);g.connect(fx);noise(t,1.4,f);env(g,t,.001,.18,1.3);},
    whoosh(t=now(),dur=1.2){const g=G(),f=filt('bandpass',400,2.5,g);g.connect(fx);noise(t,dur,f);f.frequency.setValueAtTime(300,t);f.frequency.exponentialRampToValueAtTime(1800,t+dur*.8);env(g,t,dur*.7,.35,dur*.3);},
    creak(t=now()){const g=G(),f=filt('bandpass',900,12,g);g.connect(fx);const o=osc('sawtooth',55,t,.45,f);o.frequency.linearRampToValueAtTime(38,t+.4);env(g,t,.02,.5,.4);
      const g2=G();g2.connect(fx);const o2=osc('sine',120,t+.42,.2,shaper(3,g2));o2.frequency.exponentialRampToValueAtTime(60,t+.6);env(g2,t+.42,.002,.6,.18);},
    impact(t=now(),v=1){sfx.stone(t,1.3*v);const g=G(),f=filt('lowpass',1200,.7,g);g.connect(fx);noise(t,1.2,f,{brown:true});env(g,t,.003,.9*v,1);
      for(let i=0;i<10;i++){const tt=t+.08+Math.random()*.8,gg=G(),ff=filt('bandpass',900+Math.random()*2500,5,gg);gg.connect(pan(Math.random()*1.6-.8,fx));noise(tt,.04,ff);env(gg,tt,.001,.35,.04);}},
    explosion(t=now(),v=1){const g=G();g.connect(fx);const sh=shaper(4,g);const o=osc('sine',120,t,1.2,sh);o.frequency.exponentialRampToValueAtTime(35,t+.9);env(g,t,.002,.8*v,1);
      const n1=G(),f1=filt('lowpass',3500,.7,n1);n1.connect(fx);f1.frequency.setValueAtTime(5000,t);f1.frequency.exponentialRampToValueAtTime(300,t+1.6);noise(t,2,f1,{brown:true});env(n1,t,.004,1.6*v,1.8);
      const n2=G(),f2=filt('highpass',1500,.7,n2);n2.connect(fx);noise(t,.5,f2);env(n2,t,.001,.6*v,.4);
      for(let i=0;i<14;i++){const tt=t+.2+Math.random()*1.4,gg=G(),ff=filt('bandpass',1500+Math.random()*3000,4,gg);gg.connect(pan(Math.random()*2-1,fx));noise(tt,.03,ff);env(gg,tt,.001,.25,.03);}},
    fuse(t=now(),dur=1.1){const g=G(),f=filt('highpass',3000,.7,g);g.connect(fx);const s=noise(t,dur,f);const lfo=ac.createOscillator(),lg=G(.4);lfo.frequency.value=23;lfo.type='square';lfo.connect(lg);lg.connect(g.gain);lfo.start(t);lfo.stop(t+dur);g.gain.setValueAtTime(.22,t);g.gain.setValueAtTime(0,t+dur);},
    // Schrei: Stimme mit Tonhöhenfall durch Vokalformanten
    scream(t=now(),pitch=1,v=1){const g=G();g.connect(pan(Math.random()*1.2-.6,fx));const F=[[850,1200,2800],[700,1100,2600]][Math.random()*2|0];
      const fs=F.map((f,i)=>{const b=filt('bandpass',f*(.9+pitch*.15),i?8:5,null);b.connect(g);return b;});
      const o=ac.createOscillator();o.type='sawtooth';const f0=(260+Math.random()*120)*pitch;o.frequency.setValueAtTime(f0*.8,t);o.frequency.linearRampToValueAtTime(f0*1.25,t+.12);o.frequency.exponentialRampToValueAtTime(f0*.55,t+.9);
      const lfo=ac.createOscillator(),lg=G(f0*.05);lfo.frequency.value=7+Math.random()*4;lfo.connect(lg);lg.connect(o.frequency);fs.forEach(b=>o.connect(b));o.start(t);o.stop(t+1);lfo.start(t);lfo.stop(t+1);
      const ng=G(),nf=filt('bandpass',2200,1.5,ng);ng.connect(g);noise(t,.9,nf);env(ng,t,.01,.12,.8);env(g,t,.03,.9*v,.85);},
    gore(t=now(),v=1){for(let i=0;i<3;i++){const tt=t+i*.07+Math.random()*.04,g=G(),f=filt('lowpass',2000,4,g);g.connect(fx);f.frequency.setValueAtTime(2400,tt);f.frequency.exponentialRampToValueAtTime(180,tt+.18);noise(tt,.22,f,{brown:true});env(g,tt,.002,1.1*v,.2);}
      const g=G();g.connect(fx);const o=osc('sine',90,t,.2,shaper(2,g));o.frequency.exponentialRampToValueAtTime(45,t+.15);env(g,t,.002,.4*v,.16);
      for(let i=0;i<8;i++){const tt=t+.2+Math.random()*.7,gg=G(),ff=filt('bandpass',500+Math.random()*700,3,gg);gg.connect(fx);noise(tt,.05,ff);env(gg,tt,.002,.2,.05);}},
    roar(t=now(),dur=1.6){const g=G();g.connect(fx);const sh=shaper(5,g),fs=[filt('bandpass',500,4,sh),filt('bandpass',1100,5,sh)];
      for(const d of [0,7,-9]){const o=ac.createOscillator();o.type='sawtooth';o.detune.value=d*10;o.frequency.setValueAtTime(85,t);o.frequency.linearRampToValueAtTime(130,t+dur*.25);o.frequency.exponentialRampToValueAtTime(55,t+dur);
        const lfo=ac.createOscillator(),lg=G(20);lfo.frequency.value=17;lfo.connect(lg);lg.connect(o.frequency);fs.forEach(f=>o.connect(f));o.start(t);o.stop(t+dur+.1);lfo.start(t);lfo.stop(t+dur+.1);}
      const ng=G(),nf=filt('bandpass',900,1,ng);ng.connect(sh);noise(t,dur,nf);env(ng,t,.1,.4,dur);env(g,t,.12,.35,dur*.9);},
    wings(t=now(),dur=4){for(let i=0;i<dur*1.8;i++){const tt=t+i/1.8,g=G(),f=filt('lowpass',500,1,g);g.connect(fx);noise(tt,.35,f,{brown:true});env(g,tt,.12,.5,.25);}},
    fire(t=now(),dur=1){const g=G(),f=filt('bandpass',700,.8,g);g.connect(fx);f.frequency.setValueAtTime(400,t);f.frequency.linearRampToValueAtTime(1600,t+dur*.3);noise(t,dur,f);env(g,t,.06,.7,dur*.9,.5,.2);
      for(let i=0;i<dur*20;i++){const tt=t+Math.random()*dur,gg=G(),ff=filt('highpass',3000,1,gg);gg.connect(fx);noise(tt,.015,ff);env(gg,tt,.001,.2,.012);}},
    thunder(t=now(),v=1){const g=G(),f=filt('lowpass',800,.6,g);g.connect(fx);f.frequency.setValueAtTime(3000,t);f.frequency.exponentialRampToValueAtTime(200,t+2.5);noise(t,3.5,f,{brown:true});env(g,t,.01,1.4*v,3.2);
      const c=G(),cf=filt('highpass',1200,.7,c);c.connect(fx);noise(t,.25,cf);env(c,t,.001,.6*v,.2);
      for(let i=0;i<5;i++){const tt=t+.3+Math.random()*1.5,gg=G(),ff=filt('lowpass',600,1,gg);gg.connect(fx);noise(tt,.6,ff,{brown:true});env(gg,tt,.05,.6*v,.5);}},
    curse(t=now()){choir(t,[49,52,55],1.4,.12,fx,'u');const g=G();g.connect(fx);const o=osc('sawtooth',440,t,1.4,filt('lowpass',1500,4,g));o.frequency.exponentialRampToValueAtTime(110,t+1.4);env(g,t,.3,.1,1.1);
      sfx.thunder(t+1.4,1.2);},
    shield(t=now()){[1046,1568,2093,2637].forEach((f,i)=>{const g=G();g.connect(fx);osc('sine',f,t+i*.03,1.2,g);env(g,t+i*.03,.002,.16,1.1);});const g=G(),f=filt('bandpass',4000,3,g);g.connect(fx);noise(t,.6,f);env(g,t,.002,.2,.5);},
    shieldUp(t=now()){const g=G();g.connect(fx);const o=osc('sine',500,t,.7,g);o.frequency.exponentialRampToValueAtTime(1500,t+.5);env(g,t,.05,.15,.6);bell(t+.1,86,.06);},
    crumble(t=now()){for(let i=0;i<24;i++){const tt=t+Math.random()*1.6,g=G(),f=filt('bandpass',300+Math.random()*1800,3,g);g.connect(pan(Math.random()-.5,fx));noise(tt,.08,f,{brown:Math.random()<.5});env(g,tt,.002,.5,.08);}
      const g=G(),f=filt('lowpass',500,.8,g);g.connect(fx);noise(t,2,f,{brown:true});env(g,t,.1,.8,1.8);},
    bell(t=now(),m=50,v=.35){bell(t,m,v,fx,4);},
    bells(t=now()){[0,.55,1.1,1.65,2.2,2.75].forEach((d,i)=>bell(t+d,[62,57,59,55,62,57][i],.22,fx,3.5));},
    crowd(t=now(),dur=3,v=1){for(let k=0;k<6;k++){const g=G(),f=filt('bandpass',500+k*350,2,g);g.connect(pan(k/3-.8,fx));noise(t,dur,f);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.18*v,t+.3);g.gain.setTargetAtTime(0,t+dur*.6,dur*.15);}
      for(let i=0;i<6;i++)sfx.scream(t+Math.random()*.6,1.3+Math.random()*.4,.18*v);},
    firework(t=now()){const g=G();g.connect(fx);const o=osc('sine',300,t,.5,g);o.frequency.exponentialRampToValueAtTime(1600,t+.45);env(g,t,.1,.04,.4);
      const b=t+.5,gb=G(),fb=filt('lowpass',2500,.7,gb);gb.connect(fx);noise(b,.5,fb,{brown:true});env(gb,b,.002,.7,.45);
      for(let i=0;i<14;i++){const tt=b+.1+Math.random()*.9,gg=G(),ff=filt('highpass',4000,1,gg);gg.connect(pan(Math.random()*2-1,fx));noise(tt,.02,ff);env(gg,tt,.001,.2,.015);}},
    heartbeat(t=now(),v=1){[0,.22].forEach((d,i)=>{const g=G();g.connect(fx);const o=osc('sine',i?70:82,t+d,.25,shaper(2,g));o.frequency.exponentialRampToValueAtTime(45,t+d+.18);env(g,t+d,.004,(i?.5:.7)*v,.2);});},
    ghost(t=now()){const g=G();g.connect(fx);const o=osc('sine',520,t,1.6,g);const l=ac.createOscillator(),lg=G(40);l.frequency.value=5;l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+1.6);o.frequency.linearRampToValueAtTime(320,t+1.5);env(g,t,.3,.08,1.2);},
    countdown(t=now(),last=false){wardrum(t,last?.7:.5,last?80:115,fx);if(last){sfx.cymbal(t);sfx.horn(t+.05,.8);}}};

  return {ac,start,stop,setMood,energy:x=>{E=x;},sfx,
    setMusic(on,t=.4){musOn=on;const p=mus.gain;p.cancelScheduledValues(now());p.setTargetAtTime(on?.55:0,now(),t/3);},
    setSfx(on,t=.2){const p=fx.gain;p.cancelScheduledValues(now());p.setTargetAtTime(on?1:0,now(),t/3);},
    duck(amt=.4,dur=1.5){if(!musOn)return;const p=mus.gain;p.cancelScheduledValues(now());p.setTargetAtTime(.55*amt,now(),.05);p.setTargetAtTime(.55,now()+dur,.4);},
    get mood(){return mood;},_play:play};
}
