import test from 'node:test';
import assert from 'node:assert/strict';
import { createRiotApi, pollPlayer } from '../riot-api.js';
const match = (id) => ({ metadata: { matchId: id }, info: {
  gameStartTimestamp: 1000, gameEndTimestamp: 2000, gameDuration: 600, gameMode: 'CLASSIC',
  participants: [{ puuid: 'p', win: true, championName: 'Ahri', kills: 12, deaths: 3, assists: 8 }],
} });
const player = () => ({ discordId: 'd', riotId: 'Test#EUW', puuid: 'p', linkedAt: 1500, seen: ['OLD'], announcedGame: null });

test('annonce le début puis le résultat une seule fois, même avec état rechargé', async () => {
  let p = player(); const sent = []; let saves = 0;
  const api = { active: async () => ({ gameId: 1 }), history: async () => ['OLD'], match: async (id) => match(id) };
  const run = () => pollPlayer({ api, player: p, send: async (m) => sent.push(m), persist: () => saves++ });
  await run(); p = JSON.parse(JSON.stringify(p)); await run();
  assert.equal(sent.length, 1);
  api.active = async () => null; api.history = async () => ['EUW1_1', 'OLD'];
  await run(); p = JSON.parse(JSON.stringify(p)); await run();
  assert.equal(sent.length, 2); assert.equal(saves, 2);
  assert.equal(sent[1].embeds[0].fields[1].value, '12 / 3 / 8');
});
test('un résultat retardé ou un envoi Discord échoué reste à réessayer', async () => {
  const p = player(); let available = false;
  const api = { active: async () => null, history: async () => ['EUW1_2'], match: async (id) => available ? match(id) : null };
  await pollPlayer({ api, player: p, send: async () => {}, persist: () => {} });
  assert.ok(!p.seen.includes('EUW1_2')); available = true;
  await assert.rejects(pollPlayer({ api, player: p, send: async () => { throw new Error('Discord'); }, persist: () => {} }));
  assert.ok(!p.seen.includes('EUW1_2'));
});
test('aucune annonce historique avant association ni après désassociation', async () => {
  const p = player(); p.linkedAt = 3000;
  const api = { active: async () => null, history: async () => ['EUW1_2'], match: async (id) => match(id) };
  let count = 0;
  await pollPlayer({ api, player: p, send: async () => count++, persist: () => {} });
  assert.equal(count, 0);
  await pollPlayer({ api, player: p, isCurrent: () => false, send: async () => count++, persist: () => {} });
  assert.equal(count, 0);
});
test('404 Spectator signifie aucune partie, les autres erreurs restent des erreurs', async () => {
  const paths = [];
  const api = createRiotApi({ key: 'test', sleep: async () => {}, fetchImpl: async (url) => {
    paths.push(url); return { status: 404, ok: false };
  } });
  assert.equal(await api.active('p'), null);
  await assert.rejects(api.account('name', 'tag'), /404/);
  assert.ok(paths[0].includes('euw1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/p'));
});
test('respecte Retry-After sans répéter les appels pendant la limite', async () => {
  let time = 0; let calls = 0;
  const api = createRiotApi({ key: 'test', now: () => time, sleep: async () => {}, fetchImpl: async () => {
    calls++; return calls === 1 ? { status: 429, headers: { get: () => '10' } } : { status: 200, ok: true, json: async () => [] };
  } });
  await assert.rejects(api.history('p'), /Limite/);
  await assert.rejects(api.history('p'), /Limite/); assert.equal(calls, 1);
  time = 10001; assert.deepEqual(await api.history('p'), []);
});
test('clé refusée : suspend les appels, sans exposer la clé dans l’erreur', async () => {
  let calls = 0;
  const api = createRiotApi({ key: 'SECRET', sleep: async () => {}, fetchImpl: async () => {
    calls++; return { status: 403 };
  } });
  await assert.rejects(api.active('p'), /Accès Riot refusé/);
  await assert.rejects(api.history('p'), /Accès Riot refusé/);
  assert.equal(calls, 1);
});
