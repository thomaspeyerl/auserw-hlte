// Online-Verbindung zum Raum (WebSocket über den Cloudflare Worker) mit automatischem Wiederverbinden.
import qrcode from './qrcode.mjs';

const REMOTE='https://auserw-hlte.tpeyerl.workers.dev';
// In der Android-App (eigener Asset-Host) oder lokal als Datei geht’s zum Live-Server, sonst zum eigenen Ursprung.
export const BASE=/^https?:$/.test(location.protocol)&&!/androidplatform\.net$/.test(location.hostname)?location.origin:REMOTE;
export const shareBase=()=>/androidplatform\.net$/.test(location.hostname)||!/^https?:$/.test(location.protocol)?REMOTE+'/koenigsfinger/':location.origin+location.pathname;

export function clientId(){let id=null;try{id=localStorage.getItem('kf.cid');}catch{}
  if(!id){id=[...crypto.getRandomValues(new Uint8Array(12))].map(x=>x.toString(16).padStart(2,'0')).join('');try{localStorage.setItem('kf.cid',id);}catch{}}return id;}

export async function createRoom(name,pub){const r=await fetch(BASE+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,public:pub})});
  if(!r.ok)throw new Error('Raum konnte ned angelegt werden');return r.json();}
export async function roomInfo(code){const r=await fetch(BASE+'/api/rooms/'+code);return r.json();}
export async function lobbyList(){const r=await fetch(BASE+'/api/lobby');if(!r.ok)throw new Error('Lobby ned erreichbar');return (await r.json()).rooms||[];}

export function qrSvg(text){const q=qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:5,margin:2,scalable:true});}

export class Net{
  constructor(code,{name,hostKey=null}){this.code=code;this.name=name;this.hostKey=hostKey;this.cid=clientId();this.h={};this.closed=false;this.tries=0;this.queue=[];this.connect();}
  on(t,fn){(this.h[t]||(this.h[t]=[])).push(fn);return this;}
  emit(t,d){(this.h[t]||[]).forEach(f=>f(d));}
  connect(){const u=BASE.replace(/^http/,'ws')+'/api/ws/'+this.code+'?cid='+this.cid+'&name='+encodeURIComponent(this.name)+(this.hostKey?'&hk='+this.hostKey:'');
    const ws=this.ws=new WebSocket(u);
    ws.onopen=()=>{this.tries=0;this.emit('status','online');const q=this.queue;this.queue=[];q.forEach(m=>ws.send(m));
      clearInterval(this.ping);this.ping=setInterval(()=>{try{ws.send('{"t":"ping"}');}catch{}},20000);};
    ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.t==='error'){this.fatal=m.msg;this.emit('error',m.msg);return;}this.emit(m.t,m);};
    ws.onclose=e=>{clearInterval(this.ping);if(this.closed)return;if(e.code>=4000&&e.code<4100){this.closed=true;this.emit('closed',this.fatal||'Verbindung beendet');return;}
      this.emit('status','offline');const d=Math.min(8000,500*Math.pow(2,this.tries++));setTimeout(()=>!this.closed&&this.connect(),d);};}
  raw(o){const s=JSON.stringify(o);if(this.ws.readyState===1)this.ws.send(s);else this.queue.push(s);}
  toHost(d){this.raw({t:'host',d});}
  toAll(d){this.raw({t:'all',d});}
  to(cid,d){this.raw({t:'to',cid,d});}
  close(leave=true){if(leave&&this.ws.readyState===1)try{this.ws.send('{"t":"leave"}');}catch{}this.closed=true;clearInterval(this.ping);try{this.ws.close();}catch{}}
}
