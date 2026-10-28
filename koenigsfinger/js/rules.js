// Spielregeln von Königsfinger – reine Logik ohne Grafik und DOM, damit Offline- und Online-Modus (Host) dieselben
// Regeln verwenden und die Tests sie direkt prüfen können.
//
// Jede Burg hat 5 Türme (Leben). Pro Runde schlagen zufällige Geschosse ein (Ziel fair ausgelost).
// Wer in einer Runde Türme verliert und noch steht, wählt danach: Angriffs-Boost oder Schild.
//  - Schild: fängt genau einen Treffer ab (bleibt, bis etwas einschlägt). Der Fluch durchbricht alle Schilde.
//  - Boost: wird aufgehoben und selbst gezündet (vor dem Countdown). Wirkung je nach Einstellung:
//      'doppel' – in dieser Runde kosten Treffer auf fremde Burgen 2 Türme,
//      'extra'  – ein zusätzliches Geschoss auf eine zufällige andere Burg,
//      'ziel'   – ein zusätzliches Geschoss auf eine selbst gewählte Burg.
//  - Geisterfluch (einstellbar): Gefallene dürfen einmal pro Partie eine Burg verfluchen.
import {freshSeed,hexOf,seedOfHex,rngOf,pick,hops} from './fate.js';

export const TOWERS=5;
export const ATTACKS=['katapult','drache','pulver','fluch'];
export const ATTACK_NAMES={katapult:'Katapult',drache:'Drache',pulver:'Pulverfass',fluch:'Fluch'};
export const BOOSTS=['doppel','extra','ziel'];
export const BOOST_NAMES={doppel:'Doppelschaden',extra:'Extra-Einschlag',ziel:'Eigenes Ziel'};
export const STACKS=['eins','je','viele'];
export const TEMPOS={kurz:1,mittel:2,lang:4};   // alle so viele Runden ein Geschoss mehr
export const DRAGON_WIDTH=1.5;   // Burgen bis zu diesem Abstand von der Flugbahn bekommen Drachenfeuer ab
export const CHAIN_CHANCE=.25;   // Pulverfass: Wahrscheinlichkeit, dass die Explosion auf eine zweite Burg überspringt

export const COLORS=['#d63a3a','#2f6fd6','#2fa84f','#e0b12a','#8e44c8','#e07a2a','#1fb5b5','#d64a9a'];
export const CRESTS=[['Löwe','🦁'],['Adler','🦅'],['Drache','🐉'],['Hirsch','🦌'],['Wolf','🐺'],['Bär','🐻'],['Eber','🐗'],['Eule','🦉'],['Stier','🐂'],['Fuchs','🦊']];

/* Neues Spiel. players: [{name,x,z}] in Bau-Reihenfolge. Farben und Wappen werden zugelost (reine Optik). */
export function createGame({players,attacks=ATTACKS,boostType='extra',stack='je',tempo='mittel',ghostCurse=true,seedHex=null}){
  if(players.length<2)throw new Error('mindestens 2 Spieler');
  const seed=seedHex?seedOfHex(seedHex):freshSeed(),rng=rngOf(seed);
  const cols=COLORS.slice(),crests=CRESTS.slice();
  const ps=players.map((p,id)=>{const c=cols.splice(pick(rng,cols.length),1)[0]||COLORS[id%COLORS.length],w=crests.splice(pick(rng,crests.length),1)[0];
    return {id,name:p.name,x:p.x,z:p.z,color:c,crest:w[0],crestIcon:w[1],towers:TOWERS,shields:0,boosts:0,alive:true,place:0,hitsTaken:0,curseUsed:false,revenge:0};});
  const en=ATTACKS.filter(a=>attacks.includes(a));
  return {seed:hexOf(seed),rng,round:0,players:ps,attacks:en.length?en:['katapult'],boostType:BOOSTS.includes(boostType)?boostType:'extra',
    stack:STACKS.includes(stack)?stack:'je',tempo:TEMPOS[tempo]?tempo:'mittel',ghostCurse:!!ghostCurse,winner:null,finished:false,stechen:false,log:[]};
}

export const alivePlayers=g=>g.players.filter(p=>p.alive);

/* Zufällige Einschläge pro Runde: ab 6 Burgen zwei zum Start, dann je nach Tempo mehr; höchstens (Lebende − 1) */
export function strikesFor(g){const a=alivePlayers(g).length,base=a>=6?2:1;return Math.max(1,Math.min(a-1,base+Math.floor((g.round-1)/TEMPOS[g.tempo])));}

/* Wer darf vor dem Countdown etwas zünden? Lebende mit Boost, Geister mit unbenutztem Fluch */
export function actors(g){return g.players.filter(p=>p.alive?p.boosts>0:(g.ghostCurse&&!p.curseUsed)).map(p=>p.id);}
/* Braucht diese Aktion ein selbst gewähltes Ziel? */
export const needsTarget=(g,id)=>!g.players[id].alive||g.boostType==='ziel';

/* Burgen im Kreis um ihren Schwerpunkt sortieren – in dieser Reihenfolge läuft das Fadenkreuz aus */
function ring(list){let cx=0,cz=0;list.forEach(p=>{cx+=p.x;cz+=p.z;});cx/=list.length;cz/=list.length;
  return list.slice().sort((a,b)=>Math.atan2(a.z-cz,a.x-cx)-Math.atan2(b.z-cz,b.x-cx));}
function distToLine(p,a,ang){const dx=Math.cos(ang),dz=Math.sin(ang);return Math.abs((p.x-a.x)*dz-(p.z-a.z)*dx);}

/* Eine Runde ausspielen.
   acts: {spielerId: zielId|null} – gezündete Boosts (Lebende) und Geisterflüche (Gefallene). Ziel nur bei 'ziel' bzw. Fluch nötig.
   Ablauf: erst die zufälligen Einschläge (Angriffsart gleichverteilt, Ziel gleichverteilt unter den Burgen mit Türmen;
   Fluch: Burg mit den meisten Türmen), danach Boost-Geschosse, zuletzt Geisterflüche. */
export function playRound(g,acts={}){
  if(g.finished)throw new Error('Spiel ist vorbei');
  g.round++;
  const rng=g.rng,res={round:g.round,strikes:[],fallen:[],choosers:[],stechen:false,winner:null,places:{},fired:[],doppel:[]};
  const before=g.players.map(p=>p.towers),fallenNow=[];
  const pool=()=>alivePlayers(g).filter(p=>p.towers>0);
  // Gezündetes prüfen: Boost nur mit Vorrat, Fluch nur einmal und nur als Geist
  const fired=[];
  for(const p of g.players){if(!(p.id in acts))continue;const t=acts[p.id];
    if(p.alive&&p.boosts>0){p.boosts--;fired.push({id:p.id,kind:'boost',target:t});}
    else if(!p.alive&&g.ghostCurse&&!p.curseUsed){const tp=g.players[t];if(!tp||!tp.alive)continue;p.curseUsed=true;fired.push({id:p.id,kind:'geist',target:t});}}
  res.fired=fired.map(f=>({...f}));
  const doppel=new Set(g.boostType==='doppel'?fired.filter(f=>f.kind==='boost').map(f=>f.id):[]);res.doppel=[...doppel];
  const dmgFor=id=>[...doppel].some(d=>d!==id)?2:1;

  const strike=(type,target,src,from,first)=>{const pl=pool();
    const st={type,target:target.id,targets:[target.id],dir:0,chain:null,hits:[],src,from};
    if(type==='drache'){st.dir=rng()*Math.PI;st.targets=pl.filter(p=>p===target||distToLine(p,target,st.dir)<=DRAGON_WIDTH).map(p=>p.id);}
    if(type==='pulver'&&pl.length>1&&rng()<CHAIN_CHANCE){const others=pl.filter(p=>p!==target);st.chain=others[pick(rng,others.length)].id;st.targets.push(st.chain);}
    /* Weg des Fadenkreuzes (nur Optik) über alle Burgen mit Türmen bis zum Ziel */
    const order=ring(pl),h=hops(order.length,pick(rng,order.length),order.indexOf(target),rng,first?9:src==='zufall'?3:2);
    st.path=h.path.map(i=>order[i].id);st.chaos=h.chaos;
    for(const id of st.targets){const p=g.players[id];let blocked=false,broke=false;
      if(type==='fluch'){if(p.shields>0){broke=true;p.shields=0;}}
      else if(p.shields>0){blocked=true;p.shields--;}
      const dmg=blocked?0:Math.min(p.towers,dmgFor(id));
      p.towers-=dmg;p.hitsTaken+=dmg;if(from!=null&&dmg)g.players[from].revenge+=dmg;
      st.hits.push({id,blocked,broke,dmg,towers:p.towers,shields:p.shields,fell:dmg>0&&p.towers===0});
      if(dmg>0&&p.towers===0&&!fallenNow.includes(id))fallenNow.push(id);}
    res.strikes.push(st);};

  // 1. Zufällige Einschläge
  const n=strikesFor(g);
  for(let s=0;s<n;s++){const pl=pool();if(pl.length===0||(pl.length<2&&s>0))break;
    const type=g.attacks[pick(rng,g.attacks.length)];let target;
    if(type==='fluch'){const max=Math.max(...pl.map(p=>p.towers)),top=pl.filter(p=>p.towers===max);target=top[pick(rng,top.length)];}
    else target=pl[pick(rng,pl.length)];
    strike(type,target,'zufall',null,s===0);}
  // 2. Boost-Geschosse (Doppelschaden wirkt schon auf die Einschläge oben)
  for(const f of fired){if(f.kind!=='boost'||g.boostType==='doppel')continue;
    if(pool().length<2)continue;const others=pool().filter(p=>p.id!==f.id);if(!others.length)continue;
    let target=g.boostType==='ziel'?others.find(p=>p.id===f.target):null;if(!target)target=others[pick(rng,others.length)];
    strike(g.attacks[pick(rng,g.attacks.length)],target,'boost',f.id,false);}
  // 3. Geisterflüche
  for(const f of fired){if(f.kind!=='geist')continue;const pl=pool();if(pl.length<2)continue;let target=pl.find(p=>p.id===f.target);
    if(!target){if(!pl.length)continue;target=pl[pick(rng,pl.length)];}strike('fluch',target,'geist',f.id,false);}

  /* Gefallene: sind danach alle hin, gibt es ein Stechen – die gleichzeitig Gefallenen kommen mit einem Turm zurück */
  const stillAlive=pool();
  if(stillAlive.length===0&&fallenNow.length>0){res.stechen=true;g.stechen=true;for(const id of fallenNow)g.players[id].towers=1;}
  else{const place=stillAlive.length+1;for(const id of fallenNow){const p=g.players[id];p.alive=false;p.place=place;p.shields=0;p.boosts=0;res.places[id]=place;}res.fallen=fallenNow.slice();}
  /* Wer getroffen wurde und noch steht, darf wählen */
  res.choosers=alivePlayers(g).filter(p=>p.towers<before[p.id]).map(p=>p.id);
  const left=alivePlayers(g);
  if(left.length===1){g.winner=left[0].id;left[0].place=1;g.finished=true;res.winner=g.winner;res.choosers=[];}
  g.log.push(res);return res;
}

/* Wahl nach einem Treffer: 'boost' oder 'schild'. Stapeln: 'eins' = höchstens ein Buff, 'je' = je einer, 'viele' = unbegrenzt */
export function applyChoice(g,id,choice){const p=g.players[id];if(!p||!p.alive||!['boost','schild'].includes(choice))return false;
  const k=choice==='boost'?'boosts':'shields';
  if(g.stack==='eins'){p.boosts=0;p.shields=0;p[k]=1;}else if(g.stack==='je')p[k]=1;else p[k]++;
  return true;}
