import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceProtection, TIMEOUT_MS, exemption, messageSnapshot, voiceChanges } from '../protection-core.js';

function message(calls = []) {
  return { id: 'm', guildId: 'g', channelId: 'c', guild: {ownerId:'owner'}, author: {id:'u', username:'Joueur'},
    content:'preuve', attachments:new Map(), embeds:[], member: {moderatable:true, roles:{cache:new Map()},
      timeout:async (duration) => calls.push(['timeout',duration])}, delete:async () => calls.push(['delete']) };
}

test('salon piège : timeout 28 jours avant copie, suppression et logs, sans kick ni ban', async () => {
  const calls=[]; const m=message(calls);
  const result=await enforceProtection({message:m, snapshot:messageSnapshot(m), reason:'Piège',
    capture:async()=>calls.push(['capture']),log:async()=>calls.push(['log'])});
  assert.deepEqual(calls.map(c=>c[0]),['timeout','capture','delete','log']);
  assert.equal(calls[0][1],28*24*60*60*1000); assert.equal(result.timeout,true);assert.equal(result.deleted,true);
});
test('échec du timeout : suppression encore tentée et échec documenté', async()=>{
  const calls=[];const m=message(calls); m.member.timeout=async()=>{throw Error('permissions')};
  let log;
  await enforceProtection({message:m,reason:'Piège',snapshot:{},log:async(_,r)=>log=r});
  assert.equal(log.timeout,false);assert.equal(log.deleted,true);assert.match(log.failures.join(),/refusé/);
});
test('échecs de copie et suppression : le timeout reste appliqué et les logs sont envoyés', async()=>{
  const calls=[];const m=message(calls);m.delete=async()=>{throw Error('permissions')};
  let log;let cleared=false;
  await enforceProtection({message:m,reason:'Piège',snapshot:{},capture:async()=>{throw Error('CDN')},
    deleteFailed:()=>cleared=true, log:async(_,r)=>log=r});
  assert.equal(log.timeout,true);assert.equal(log.deleted,false);assert.equal(log.failures.length,2);assert.equal(cleared,true);
});
test('mode alerte : aucune suppression, aucun timeout', async()=>{
  const calls=[];
  await enforceProtection({message:message(calls),snapshot:{},reason:'Image',mode:'alert',log:async()=>calls.push(['log'])});
  assert.deepEqual(calls,[['log']]);
});
test('administrateur non modérable : échec du mute indiqué, pas de kick de remplacement', async()=>{
  const m=message();m.member.moderatable=false;let result;
  await enforceProtection({message:m,snapshot:{},reason:'Piège',log:async(_,r)=>result=r});
  assert.equal(result.timeout,false);assert.equal(result.deleted,true);assert.match(result.failures[0],/administrateur/);
});
test('timeout récent conservé, jamais raccourci ni renouvelé par un minuteur', async()=>{
  const calls=[];const m=message(calls);m.member.communicationDisabledUntilTimestamp=1000+TIMEOUT_MS;
  await enforceProtection({message:m,snapshot:{},reason:'Piège',now:()=>1000,log:async()=>{}});
  assert.deepEqual(calls,[['delete']]);
});
test('bots, webhooks, propriétaire et rôles exemptés ignorés',()=>{
  const m=message();assert.equal(exemption(m,{exemptRoleIds:[]}),null);
  m.member.roles.cache.set('r',{});assert.equal(exemption(m,{exemptRoleIds:['r']}),'rôle exempté');
  m.author.bot=true;assert.ok(exemption(m,{}));m.author.bot=false;m.webhookId='w';assert.ok(exemption(m,{}));
  delete m.webhookId;m.author.id='owner';assert.equal(exemption(m,{}),'propriétaire');
});
test('copie du message : texte, fichiers, aperçus et auteur conservés',()=>{
  const m=message();m.attachments.set('a',{name:'preuve.png',url:'https://cdn.discordapp.com/attachments/1/2/a.png',size:100});
  const s=messageSnapshot(m);assert.equal(s.content,'preuve');assert.equal(s.authorId,'u');assert.equal(s.attachments[0].name,'preuve.png');
  assert.equal(messageSnapshot({...m,content:undefined,author:undefined}).content,null);
});
test('vocal : arrivée, départ, déplacement et mute serveur identifiés séparément',()=>{
  assert.match(voiceChanges({channelId:null},{channelId:'a'})[0],/Connexion/);
  assert.match(voiceChanges({channelId:'a'},{channelId:null})[0],/Déconnexion/);
  assert.match(voiceChanges({channelId:'a',serverMute:false},{channelId:'b',serverMute:true}).join(),/Déplacement.*Mute serveur/);
});
