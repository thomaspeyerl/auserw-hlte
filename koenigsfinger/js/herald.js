// Der Herold: Ansagen in steirisch-mittelalterlichem Ton. Mehrere Varianten pro Anlass, damit es nicht fad wird.
const pickOne=a=>a[Math.floor(Math.random()*a.length)];
const zahl=n=>['koa','oa','zwoa','drei','vier','fünf','sechs','siebn','acht'][n]||String(n);
const fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]??'');

const T={
  welcome:['Hört, hört, Leit’ln! Wer am End’ no a Burg hat, der wird König!','Seid’s gegrüßt, edle Herrschaften – hiaz wird um die Kron’ g’spielt!'],
  place:['{name}, tippt’s dorthin, wo Eure Burg steh’n soll!','Herr {name}, wo soll Eure Feste hin? Tippt’s auf’s Land!','{name}, such’ Euch a feins Platzerl für Eure Burg!'],
  tooClose:['Zu nah beim Nachbarn – des gibt nur Streit! Woanders hin.','Do steht scho wer, gö! A bissl weiter weg.'],
  edge:['Ned so weit am Rand, sonst fallt’s ins Moor!','Weiter herein ins Land, bitte schön!'],
  lots:['Das Los hat g’sprochen: Farb’n und Wappen san vergeben!','Die Wappen san verteilt – möge jeder sei Viech in Ehren halten!'],
  round1:['Runde {n}! A Geschoss is unterwegs!','Hört, hört – Runde {n} hebt an! Oa Einschlag droht!','Runde {n}. Herrgott, steh’ uns bei – glei kracht’s!'],
  round:['Runde {n}! {k} Geschoss{e} san unterwegs!','Hört, hört – Runde {n} hebt an! {k} Einschläg’ droh’n!','Runde {n}. Herrgott, steh’ uns bei – {k} Mal kracht’s!'],
  tension:['Wen erwischt’s…?','Des Fadenkreuz sucht sei Opfer…','Herzklopfen, Leit’ln…','Wer is der Nächste?'],
  choose:['{name}, Ihr seid getroffen! Rache oder Deckung?','Herr {name}, Ihr blutet – wählt’s: Boost oder Schild!'],
  chooseSecret:['Wer getroffen wurde, wählt am eigenen Handy: Boost oder Schild!'],
  tookBoost:['{name} schmiedet Rache – a Boost!','{name} schleift die Klingen – Boost g’nommen!'],
  tookShield:['{name} verschanzt si hinter an Schild.','{name} lasst an Schild schmieden.'],
  fireAsk:['{name}, wollt Ihr Euren Boost zünden?','{name}, is jetzt die Zeit für Rache?'],
  curseAsk:['Geist von {name}, wollt Ihr a Burg verfluchen?','Huuu – {name}, Euer Fluch wartet. Jetzt?'],
  actSecret:['Wer an Boost oder Geisterfluch hat: jetzt zünden – am eigenen Handy!'],
  boostDoppel:['{name} zündet den Boost – diese Rund’ tut’s doppelt weh!'],
  boostExtra:['{name} schickt a Extra-Geschoss los!','{name} zündet den Boost – a Geschoss mehr!'],
  boostZiel:['{name} nimmt {target} ins Visier – Rache!','{name} hat a Rechnung offen mit {target}!'],
  ghostCurse:['Da Geist von {name} verflucht {target}! Huuu!','Aus’m Jenseits verflucht {name} die Burg von {target}!'],
  double:['Doppelschaden! {name} verliert gleich zwoa Türm’!'],
  countdown:['Auf die Mauern!','Haltet’s Euch fest!','Jetzt kracht’s!'],
  katapult:['Des Katapult knarzt – a Felsbrocken fliagt!','Katapult! Da kummt a Stoan daher, so groß wia a Kuah!'],
  drache:['A Drach! Gott steh’ uns bei, er speit Feuer übers Land!','Drachenalarm! Der brennt alles nieder, was in seiner Bahn steht!'],
  pulver:['Pulverfass! Glei tuat’s an Tuscher!','A Fassl voll Schwarzpulver – Ohren zua!'],
  fluch:['A Fluch! Die Hex’ hat’s auf die stärkste Burg abg’sehn!','Finstre Mächte! Da Fluch trifft den, der am meisten Türm’ hat!'],
  chain:['Des Feuer springt über – a zweite Burg brennt!','Kettenreaktion! Des hat ma davon, wenn ma Pulver lagert!'],
  hit:['{name} verliert an Turm – nur mehr {t} steh’n!','Treffer bei {name}! {T} Türm’ übrig.','Aua! {name} hat nur mehr {t} {tw}.'],
  lastTower:['{name} hängt am letzten Turm – a Gebet wär’ ned schlecht!','Nur mehr oa Turm bei {name}. Des wird knapp, Herrschaftszeiten!'],
  blocked:['Da Schild hält! {name} lacht si ins Fäustl.','Abprallt! Der Schild von {name} is aus guadem steirischen Eisen.'],
  shieldBroken:['Da Fluch zerreißt den Schild von {name}!','Koa Schild hilft gegen an Fluch – {name} kriagt’s volle Packl!'],
  fall:['Die Burg von {name} is g’fallen! A Bluatbad, Herrschaftszeiten!','{name} is hin! Nur mehr a Ruine und a Lackerl Bluat.','Aus is’ und gar is’ für {name}. Ruhe in Frieden, oida Haudegen.'],
  stechen:['Olle hin auf amoi?! Des gilt ned – STECHEN! Jeder kriagt oan Turm z’ruck!','Gleichzeitig g’fallen? Na, so ned – Stechen!'],
  finale:['Nur mehr zwoa! Hiaz wird’s ernst, meine Herrschaften.','Des Finale! Man hört nur mehr die Herzen pumpern.'],
  king:['Hört, hört! Lang lebe König {name}, Herrscher über’s ganze Steirerland!','Die Kron’ g’hört {name}! Kniet’s nieder, Leit’ln!','Heil König {name}! A Hoch auf die neue Majestät!'],
  matchKing:['{name} gewinnt die ganze Fehde und wird Großkönig!'],
  next:['Auf in die nächste Schlacht!'],
};

export function say(key,v={}){const s=pickOne(T[key]||[key]);const t=v.t;
  return fill(s,{...v,k:v.k!=null?zahl(v.k):'',e:v.k>1?'e':'',T:t!=null?zahl(t).replace(/^./,c=>c.toUpperCase()):'',t:t!=null?zahl(t):'',tw:t===1?'Turm':'Türm’',s:v.s??''});}
export const joinNames=a=>a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' und '+a[a.length-1];
