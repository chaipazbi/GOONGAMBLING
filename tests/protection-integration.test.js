import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Events, PermissionFlagsBits } from 'discord.js';
import sharp from 'sharp';

// Isoler le stockage avant tout import de store.js : ne touche jamais data.json.
const testPath=resolve(`tests/.protection-${process.pid}.json`);
process.env.DATA_PATH=testPath;
const {createProtection}=await import('../protection.js');
const {getSettings}=await import('../store.js');
const {fingerprint}=await import('../scam-images.js');
after(()=>rmSync(testPath,{force:true}));
const settle=async()=>{for(let n=0;n<20;n++)await new Promise(setImmediate)};

function setup() {
  const sent=[];const calls=[];const client=new EventEmitter();client.user={id:'bot'};
  client.channels={fetch:async(id)=>({id,guildId:'g',isTextBased:()=>true,send:async(p)=>sent.push(p)})};
  const protection=createProtection(client);const st=getSettings('g');
  st.protection={trapChannelId:null,logChannelId:'logs-protection',imageMode:'off',exemptRoleIds:[],images:[]};
  st.serverLogs={channelId:'logs-generaux',enabled:true};
  const m={id:'123',guildId:'g',channelId:'normal',guild:{id:'g',ownerId:'owner'},content:'Ancien texte',
    author:{id:'u',username:'Joueur'},attachments:new Map(),embeds:[],createdTimestamp:1,
    member:{moderatable:true,roles:{cache:new Map()},timeout:async(ms)=>calls.push(['timeout',ms])},
    delete:async()=>{calls.push(['delete']);client.emit(Events.MessageDelete,m)}};
  return {sent,calls,client,protection,st,m};
}

test('intégration : salon piège sanctionne et copie le texte une seule fois dans les logs',async()=>{
  const {sent,calls,client,protection,st,m}=setup();st.protection.trapChannelId='normal';
  assert.equal(await protection.onMessage(m),true);await settle();
  assert.deepEqual(calls.map(c=>c[0]),['timeout','delete']);
  assert.equal(sent.length,1);assert.match(sent[0].embeds[0].title,/Protection/);
  const proof=JSON.parse(sent[0].files[0].attachment.toString());assert.equal(proof.content,'Ancien texte');assert.equal(proof.authorId,'u');
  assert.deepEqual(sent[0].allowedMentions,{parse:[]});client.removeAllListeners();
});
test('intégration : messages modifiés et supprimés utilisent le contenu conservé',async()=>{
  const {sent,client,protection,m}=setup();await protection.onMessage(m);
  const updated={...m,content:'Nouveau texte'};
  client.emit(Events.MessageUpdate,m,updated);await settle();
  client.emit(Events.MessageDelete,{id:'123',guildId:'g',channelId:'normal',partial:true});await settle();
  assert.equal(sent.length,2);assert.match(sent[0].embeds[0].title,/modifié/);
  const changes=JSON.parse(sent[0].files[0].attachment.toString());assert.equal(changes.before.content,'Ancien texte');assert.equal(changes.after.content,'Nouveau texte');
  const deleted=JSON.parse(sent[1].files[0].attachment.toString());assert.equal(deleted.content,'Nouveau texte');client.removeAllListeners();
});
test('intégration : logs propres ignorés, vocal et audit conservent le véritable auteur',async()=>{
  const {sent,client,protection,m}=setup();await protection.onMessage({...m,channelId:'logs-generaux'});
  client.emit(Events.MessageDelete,{...m,channelId:'logs-generaux'});await settle();assert.equal(sent.length,0);
  client.emit(Events.VoiceStateUpdate,{channelId:null},{channelId:'voc',guild:{id:'g'},member:{user:m.author}});
  client.emit(Events.GuildAuditLogEntryCreate,{id:'audit',action:22,executor:{id:'admin',username:'Modo'},executorId:'admin',targetId:'u',reason:'Spam',changes:[]},{id:'g'});
  await settle();assert.equal(sent.length,2);assert.match(sent[0].embeds[0].fields[1].value,/Connexion/);
  assert.match(sent[1].embeds[0].fields.find(f=>f.name==='Auteur').value,/admin/);client.removeAllListeners();
});
test('intégration : une image ajoutée détectée déclenche suppression et timeout avec sa preuve',async()=>{
  const {sent,calls,client,protection,st,m}=setup();
  const bytes=await sharp({create:{width:128,height:96,channels:3,background:'#abff34'}}).png().toBuffer();
  st.protection.images.push({id:'test',name:'test.png',...await fingerprint(bytes)});st.protection.imageMode='auto';
  const url='https://cdn.discordapp.com/attachments/1/2/test.png';m.attachments.set('a',{url,name:'test.png',size:bytes.length,contentType:'image/png'});
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response(bytes);
  try{assert.equal(await protection.onMessage(m),true);await settle();}finally{globalThis.fetch=original;}
  assert.deepEqual(calls.map(c=>c[0]),['timeout','delete']);assert.equal(sent.length,1);
  assert.ok(sent[0].files.some(f=>f.attachment.equals(bytes)));client.removeAllListeners();
});
test('intégration : activation interdite sans salon de preuves, aucune configuration partielle',async()=>{
  const {protection,st,client}=setup();st.protection.logChannelId=null;
  const i={guildId:'g',guild:{id:'g'},memberPermissions:{has:()=>true},commandName:'protection',
    options:{getSubcommand:()=> 'images',getString:()=> 'auto'},deferReply:async()=>{}};
  await assert.rejects(protection.command(i),/logs/);assert.equal(st.protection.imageMode,'off');client.removeAllListeners();
});
