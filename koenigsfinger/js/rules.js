// Spielregeln von Königsfinger – reine Logik ohne Grafik und DOM, damit Offline- und Online-Modus (Host) dieselben
// Regeln verwenden und die Tests sie direkt prüfen können.
import {freshSeed,hexOf,seedOfHex,rngOf,pick,hops} from './fate.js';

export const TOWERS=3;
export const ATTACKS=['katapult','drache','pulver','fluch'];
export const ATTACK_NAMES={katapult:'Katapult',drache:'Drache',pulver:'Pulverfass',fluch:'Fluch'};
export const DRAGON_WIDTH=1.5;   // Burgen bis zu diesem Abstand von der Flugbahn bekommen Drachenfeuer ab
export const CHAIN_CHANCE=.25;   // Pulverfass: Wahrscheinlichkeit, dass die Explosion auf eine zweite Burg überspringt

export const COLORS=['#d63a3a','#2f6fd6','#2fa84f','#e0b12a','#8e44c8','#e07a2a','#1fb5b5','#d64a9a'];
export const CRESTS=[['Löwe','🦁'],['Adler','🦅'],['Drache','🐉'],['Hirsch','🦌'],['Wolf','🐺'],['Bär','🐻'],['Eber','🐗'],['Greif','🦉'],['Stier','🐂'],['Fuchs','🦊']];

/* Neues Spiel. players: [{name,x,z}] in Bau-Reihenfolge. Farben und Wappen werden zugelost (reine Optik). */
export function createGame({players,attacks=ATTACKS,betMode='round',seedHex=null}){
  if(players.length<2)throw new Error('mindestens 2 Spieler');
  const seed=seedHex?seedOfHex(seedHex):freshSeed(),rng=rngOf(seed);
  const cols=COLORS.slice(),crests=CRESTS.slice();
  const ps=players.map((p,id)=>{const c=cols.splice(pick(rng,cols.length),1)[0]||COLORS[id%COLORS.length],w=crests.splice(pick(rng,crests.length),1)[0];
    return {id,name:p.name,x:p.x,z:p.z,color:c,crest:w[0],crestIcon:w[1],towers:TOWERS,shield:false,alive:true,place:0,ghostPts:0,kingBet:null,hitsTaken:0};});
  const en=ATTACKS.filter(a=>attacks.includes(a));
  return {seed:hexOf(seed),rng,round:0,players:ps,attacks:en.length?en:['katapult'],betMode,winner:null,finished:false,stechen:false,log:[]};
}

export const alivePlayers=g=>g.players.filter(p=>p.alive);

/* Einschläge pro Runde: steigt alle drei Runden um eins, höchstens (Lebende − 1) */
export function strikesFor(g){const a=alivePlayers(g).length;return Math.max(1,Math.min(a-1,1+Math.floor((g.round-1)/3)));}

/* Burgen im Kreis um ihren Schwerpunkt sortieren – in dieser Reihenfolge läuft das Fadenkreuz aus */
function ring(list){let cx=0,cz=0;list.forEach(p=>{cx+=p.x;cz+=p.z;});cx/=list.length;cz/=list.length;
  return list.slice().sort((a,b)=>Math.atan2(a.z-cz,a.x-cx)-Math.atan2(b.z-cz,b.x-cx));}

function distToLine(p,a,ang){const dx=Math.cos(ang),dz=Math.sin(ang);return Math.abs((p.x-a.x)*dz-(p.z-a.z)*dx);}

/* Eine Runde ausspielen. bets: {spielerId: zielId} (offen gesetzt; Geister dürfen mitwetten).
   Ablauf je Einschlag: Angriffsart gleichverteilt aus den gewählten, Ziel gleichverteilt unter den Lebenden
   (Fluch: Burg mit den meisten Türmen, Gleichstand gleichverteilt). Schilde fangen alles außer dem Fluch ab. */
export function playRound(g,bets={}){
  if(g.finished)throw new Error('Spiel ist vorbei');
  g.round++;
  const rng=g.rng,res={round:g.round,strikes:[],fallen:[],correct:[],shieldsNext:[],stechen:false,winner:null,places:{}};
  const shielded=new Set(g.players.filter(p=>p.alive&&p.shield).map(p=>p.id)),landed=new Set(),fallenNow=[];
  const n=strikesFor(g);
  for(let s=0;s<n;s++){
    const pool=alivePlayers(g).filter(p=>p.towers>0);
    if(pool.length<2&&s>0)break;
    if(pool.length===0)break;
    const type=g.attacks[pick(rng,g.attacks.length)];
    let target;
    if(type==='fluch'){const max=Math.max(...pool.map(p=>p.towers)),top=pool.filter(p=>p.towers===max);target=top[pick(rng,top.length)];}
    else target=pool[pick(rng,pool.length)];
    const st={type,target:target.id,targets:[target.id],dir:0,chain:null,hits:[]};
    if(type==='drache'){st.dir=rng()*Math.PI;st.targets=pool.filter(p=>p===target||distToLine(p,target,st.dir)<=DRAGON_WIDTH).map(p=>p.id);}
    if(type==='pulver'&&pool.length>1&&rng()<CHAIN_CHANCE){const others=pool.filter(p=>p!==target);st.chain=others[pick(rng,others.length)].id;st.targets.push(st.chain);}
    /* Weg des Fadenkreuzes (nur Optik) über alle Lebenden bis zum Hauptziel */
    const order=ring(pool),h=hops(order.length,pick(rng,order.length),order.indexOf(target),rng,s===0?5:2);
    st.path=h.path.map(i=>order[i].id);st.chaos=h.chaos;
    for(const id of st.targets){const p=g.players[id];landed.add(id);
      const blocked=shielded.has(id)&&type!=='fluch';
      if(!blocked&&p.towers>0){p.towers--;p.hitsTaken++;}
      if(type==='fluch'&&shielded.has(id))shielded.delete(id);
      st.hits.push({id,blocked,towers:p.towers,fell:!blocked&&p.towers===0});
      if(!blocked&&p.towers===0&&!fallenNow.includes(id))fallenNow.push(id);}
    res.strikes.push(st);
  }
  /* Wetten auswerten: Treffer = Tipp auf eine Burg, in die diese Runde etwas eingeschlagen hat */
  for(const p of g.players){p.shield=false;const b=bets[p.id];if(b==null||!landed.has(b))continue;
    res.correct.push(p.id);if(p.alive&&!fallenNow.includes(p.id)&&g.betMode==='round'){p.shield=true;res.shieldsNext.push(p.id);}else if(!p.alive)p.ghostPts++;}
  /* Gefallene: sind danach alle hin, gibt es ein Stechen – die gleichzeitig Gefallenen kommen mit einem Turm zurück */
  const stillAlive=alivePlayers(g).filter(p=>p.towers>0);
  if(stillAlive.length===0&&fallenNow.length>0){res.stechen=true;g.stechen=true;for(const id of fallenNow)g.players[id].towers=1;}
  else{const place=stillAlive.length+1;for(const id of fallenNow){const p=g.players[id];p.alive=false;p.place=place;res.places[id]=place;}res.fallen=fallenNow.slice();}
  const left=alivePlayers(g);
  if(left.length===1){g.winner=left[0].id;left[0].place=1;g.finished=true;res.winner=g.winner;}
  g.log.push(res);return res;
}

/* Königswette (Setz-Modus „nur am Anfang“): jeder tippt einmal, wer König wird */
export function setKingBets(g,bets){for(const p of g.players)p.kingBet=bets[p.id]??null;}
export const kingmakers=g=>g.finished?g.players.filter(p=>p.kingBet===g.winner).map(p=>p.id):[];
