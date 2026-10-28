// Cloudflare Worker: liefert die statischen Spiele aus und betreibt den Online-Modus von Königsfinger.
// Räume sind Durable Objects (Raumcode = Name). Der Gastgeber-Browser rechnet das Spiel, der Raum leitet nur weiter:
//  Gast → Gastgeber: {t:'host',d}       Gastgeber → alle: {t:'all',d}       Gastgeber → einer: {t:'to',cid,d}
// Eine zweite Durable-Object-Instanz („Lobby“) führt die Liste der öffentlichen Räume.
import {DurableObject} from 'cloudflare:workers';

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...cors}});
const clean=(s,n=16)=>String(s||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,n);
const randCode=()=>{const b=crypto.getRandomValues(new Uint8Array(4));return [...b].map(x=>CODE_CHARS[x%CODE_CHARS.length]).join('');};
const randKey=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');

export default {
  async fetch(req,env){
    const url=new URL(req.url),p=url.pathname;
    if(!p.startsWith('/api/'))return env.ASSETS.fetch(req);
    if(req.method==='OPTIONS')return new Response(null,{headers:cors});
    if(p==='/api/lobby')return json(await (await lobby(env).fetch('https://lobby/list')).json());
    if(p==='/api/rooms'&&req.method==='POST'){
      let body={};try{body=await req.json();}catch{}
      for(let i=0;i<6;i++){const code=randCode(),hostKey=randKey();
        const r=await room(env,code).fetch('https://room/init',{method:'POST',body:JSON.stringify({code,hostKey,public:!!body.public,host:clean(body.name)})});
        if(r.ok)return json({code,hostKey});}
      return json({error:'kein freier Raumcode'},503);}
    const m=p.match(/^\/api\/ws\/([A-Z0-9]{4})$/);
    if(m){if(req.headers.get('Upgrade')!=='websocket')return json({error:'WebSocket erwartet'},426);return room(env,m[1]).fetch(req);}
    const ex=p.match(/^\/api\/rooms\/([A-Z0-9]{4})$/);
    if(ex)return json(await (await room(env,ex[1]).fetch('https://room/info')).json());
    return json({error:'unbekannt'},404);
  }
};
const room=(env,code)=>env.ROOMS.get(env.ROOMS.idFromName(code));
const lobby=env=>env.LOBBY.get(env.LOBBY.idFromName('lobby'));

export class Room extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.env=env;
    ctx.blockConcurrencyWhile(async()=>{this.meta=await ctx.storage.get('meta')||null;this.members=await ctx.storage.get('members')||[];});}
  async fetch(req){const url=new URL(req.url);
    if(url.pathname==='/init'){if(this.meta&&Date.now()-this.meta.created<6*3600e3)return new Response('belegt',{status:409});
      const b=await req.json();this.meta={code:b.code,hostKey:b.hostKey,public:b.public,host:b.host,created:Date.now(),started:false};this.members=[];
      await this.ctx.storage.put({meta:this.meta,members:this.members});await this.ctx.storage.setAlarm(Date.now()+6*3600e3);return new Response('ok');}
    if(url.pathname==='/info')return new Response(JSON.stringify(this.meta?{ok:true,code:this.meta.code,started:this.meta.started,players:this.members.length,host:this.meta.host}:{ok:false}));
    // WebSocket
    if(!this.meta)return json({error:'Raum gibt’s ned'},404);
    const cid=clean(url.searchParams.get('cid'),40)||randKey(),name=clean(url.searchParams.get('name'))||'Namenlos',isHost=url.searchParams.get('hk')===this.meta.hostKey;
    let mem=this.members.find(x=>x.cid===cid);
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);
    this.ctx.acceptWebSocket(server);
    if(!mem){
      if(!isHost&&(this.meta.started||this.members.length>=8)){server.send(JSON.stringify({t:'error',msg:this.meta.started?'Des Spiel hat scho ang’fangt.':'Der Raum is voll.'}));server.close(4000,'zu');return new Response(null,{status:101,webSocket:client});}
      mem={cid,name,host:isHost};if(isHost)this.members.unshift(mem);else this.members.push(mem);await this.ctx.storage.put('members',this.members);}
    else if(!this.meta.started&&mem.name!==name){mem.name=name;await this.ctx.storage.put('members',this.members);}
    for(const ws of this.ctx.getWebSockets())if(ws!==server&&ws.deserializeAttachment()?.cid===cid)try{ws.close(4001,'ersetzt');}catch{}
    server.serializeAttachment({cid,host:mem.host});
    server.send(JSON.stringify({t:'hello',cid,host:mem.host,code:this.meta.code,started:this.meta.started}));
    if(!mem.host)this.toHost({t:'join',cid,name:mem.name});
    this.roster();this.publish();
    return new Response(null,{status:101,webSocket:client});}
  webSocketMessage(ws,raw){let m;try{m=JSON.parse(raw);}catch{return;}const a=ws.deserializeAttachment()||{};
    if(m.t==='ping'){ws.send('{"t":"pong"}');return;}
    if(a.host){
      if(m.t==='all'){const s=JSON.stringify({t:'ev',d:m.d});for(const w of this.ctx.getWebSockets())if(w!==ws)try{w.send(s);}catch{}}
      else if(m.t==='to'){const s=JSON.stringify({t:'ev',d:m.d});for(const w of this.ctx.getWebSockets())if(w.deserializeAttachment()?.cid===m.cid)try{w.send(s);}catch{}}
      else if(m.t==='start'){this.meta.started=true;this.ctx.storage.put('meta',this.meta);this.publish();}
      else if(m.t==='reopen'){this.meta.started=false;this.ctx.storage.put('meta',this.meta);this.publish();}
      else if(m.t==='kick'){this.members=this.members.filter(x=>x.cid!==m.cid);this.ctx.storage.put('members',this.members);
        for(const w of this.ctx.getWebSockets())if(w.deserializeAttachment()?.cid===m.cid)try{w.send(JSON.stringify({t:'error',msg:'Ihr wurdet aus dem Raum g’worfen.'}));w.close(4002,'raus');}catch{}this.roster();this.publish();}
    }else if(m.t==='host')this.toHost({t:'from',cid:a.cid,d:m.d});
    else if(m.t==='leave'&&!this.meta.started){this.members=this.members.filter(x=>x.cid!==a.cid);this.ctx.storage.put('members',this.members);this.toHost({t:'leave',cid:a.cid});this.roster();this.publish();}}
  webSocketClose(ws){const a=ws.deserializeAttachment()||{};if(a.host){this.broadcast({t:'hostgone'});this.publish();}else this.toHost({t:'offline',cid:a.cid});this.roster();}
  webSocketError(ws){this.webSocketClose(ws);}
  online(){const on=new Set();for(const w of this.ctx.getWebSockets()){const a=w.deserializeAttachment();if(a&&w.readyState===1)on.add(a.cid);}return on;}
  roster(){const on=this.online();this.broadcast({t:'roster',members:this.members.map(m=>({cid:m.cid,name:m.name,host:m.host,online:on.has(m.cid)})),started:this.meta.started});}
  broadcast(o){const s=JSON.stringify(o);for(const w of this.ctx.getWebSockets())try{w.send(s);}catch{}}
  toHost(o){const s=JSON.stringify(o);for(const w of this.ctx.getWebSockets())if(w.deserializeAttachment()?.host)try{w.send(s);}catch{}}
  publish(){if(!this.meta?.public)return;const host=this.members.find(m=>m.host);
    this.ctx.waitUntil(lobby(this.env).fetch('https://lobby/update',{method:'POST',body:JSON.stringify({code:this.meta.code,host:host?.name||this.meta.host,players:this.members.length,open:!this.meta.started&&this.members.length<8&&!!host&&this.online().has(host.cid)})}).catch(()=>{}));}
  async alarm(){for(const w of this.ctx.getWebSockets())try{w.close(4003,'abgelaufen');}catch{}await this.ctx.storage.deleteAll();this.meta=null;this.members=[];}
}

export class Lobby extends DurableObject{
  constructor(ctx,env){super(ctx,env);ctx.blockConcurrencyWhile(async()=>{this.rooms=await ctx.storage.get('rooms')||{};});}
  async fetch(req){const url=new URL(req.url),now=Date.now();
    for(const [k,r] of Object.entries(this.rooms))if(now-r.ts>15*60e3)delete this.rooms[k];
    if(url.pathname==='/update'){const b=await req.json();if(b.open)this.rooms[b.code]={code:b.code,host:clean(b.host),players:b.players|0,ts:now};else delete this.rooms[b.code];
      await this.ctx.storage.put('rooms',this.rooms);return new Response('ok');}
    return new Response(JSON.stringify({rooms:Object.values(this.rooms).sort((a,b)=>b.ts-a.ts).slice(0,30)}));}
}
