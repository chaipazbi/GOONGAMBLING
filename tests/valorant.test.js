import test from 'node:test';
import assert from 'node:assert/strict';
import { createValorantApi, valorantRows, valorantStatsEmbed, valorantHistoryEmbed, pollValorantPlayer } from '../valorant-api.js';
const m = (id, kills = 12, deaths = 3, win = true) => ({ metadata: { match_id: id, started_at: '2026-10-04T12:00:00Z', map: { name: 'Ascent' }, queue: { name: 'Competitive' } },
  players: [{ puuid: 'p', team_id: 'Blue', agent: { name: 'Sage' }, stats: { kills, deaths, assists: 6, score: 3200, headshots: 8, bodyshots: 10, legshots: 2 } }],
  teams: [{ team_id: 'Blue', won: win, rounds: { won: win ? 13 : 7, lost: win ? 7 : 13 } }, { team_id: 'Red', won: !win }] });

test('normalise le joueur ciblé, le résultat, la carte et le K/D/A v4', () => {
  const rows = valorantRows([m('a'), m('b', 4, 5, false)], 'p');
  assert.equal(rows[0].result, 'Victoire'); assert.equal(rows[1].result, 'Défaite');
  assert.equal(rows[0].agent, 'Sage'); assert.equal(rows[0].map, 'Ascent');
  assert.equal(rows[0].kills, 12); assert.equal(rows[0].start, Date.parse('2026-10-04T12:00:00Z'));
  assert.equal(valorantRows([m('a')], 'other').length, 0);
});
test('calcule le K/D global et le rang, sans inventer une variation de RR par match', () => {
  const rows = valorantRows([m('a'), m('b', 4, 5, false)], 'p');
  const e = valorantStatsEmbed(rows, { current: { tier: { name: 'Gold 2' }, rr: 23, last_change: -12 }, peak: { tier: { name: 'Platinum 1' } } }, 'Player#EUW', 20);
  assert.equal(e.fields.find((f) => f.name === 'K/D').value, '2');
  assert.match(e.fields[0].value, /23 RR/); assert.match(e.fields[2].value, /dernier changement du compte/);
  assert.match(e.fields.find((f) => f.name === 'Tirs touchés à la tête').value, /40/);
  assert.match(e.fields.find((f) => f.name === 'Taux de victoire').value, /50/);
});
test('aucun résultat décidé ou aucune mort : pas de statistiques NaN', () => {
  const draw = m('a', 10, 0); draw.teams.forEach((t) => t.won = false);
  const rows = valorantRows([draw], 'p'); assert.equal(rows[0].decided, false);
  const e = valorantStatsEmbed(rows, null, 'Player#EUW', 1);
  assert.ok(!JSON.stringify(e).includes('NaN')); assert.match(e.fields[3].value, /∞/);
  assert.equal(valorantHistoryEmbed(rows, 'Player#EUW').fields.length, 1);
});
test('réponse sans statistiques : signale le format au lieu d’afficher des zéros', () => {
  const broken = m('a'); delete broken.players[0].stats;
  assert.throws(() => valorantRows([broken], 'p'), /K\/D\/A manquant/);
});
test('annonce les nouveaux résultats une fois, après restauration de l’état', async () => {
  let p = { puuid: 'p', discordId: 'd', riotId: 'Player#EUW', seen: [], linkedAt: Date.parse('2026-10-04T11:00:00Z') };
  let sent = 0;
  const run = () => pollValorantPlayer({ api: { matches: async () => [m('a')] }, player: p, send: async () => sent++, persist: () => {} });
  await run(); p = JSON.parse(JSON.stringify(p)); await run(); assert.equal(sent, 1);
});
test('échec Discord : résultat conservé pour réessayer, anciennes parties ignorées', async () => {
  const p = { puuid: 'p', discordId: 'd', riotId: 'Player#EUW', seen: [], linkedAt: 0 };
  const args = { api: { matches: async () => [m('a')] }, player: p, persist: () => {} };
  await assert.rejects(pollValorantPlayer({ ...args, send: async () => { throw new Error('Discord'); } }));
  assert.deepEqual(p.seen, []); p.linkedAt = Date.parse('2026-10-04T13:00:00Z');
  await pollValorantPlayer({ ...args, send: async () => { throw new Error('Ancien résultat envoyé'); } });
  assert.deepEqual(p.seen, ['a']);
});
test('historique paginé, authentification et encodage du PUUID', async () => {
  const urls = [];
  const api = createValorantApi({ key: 'FAKE', sleep: async () => {}, fetchImpl: async (url, options) => {
    urls.push(url); assert.equal(options.headers.Authorization, 'FAKE');
    const start = Number(new URL(url).searchParams.get('start'));
    return { ok: true, status: 200, json: async () => ({ status: 200, data: Array.from({ length: 10 }, (_, i) => m(String(start + i))) }) };
  } });
  const matches = await api.matches('p/uuid', 20); assert.equal(matches.length, 20);
  assert.equal(urls.length, 2); assert.ok(urls[0].includes('p%2Fuuid')); assert.ok(urls[1].includes('start=10'));
});
test('429 respecte Retry-After et clé refusée suspend les appels', async () => {
  let time = 0; let calls = 0;
  const api = createValorantApi({ key: 'SECRET', now: () => time, sleep: async () => {}, fetchImpl: async () => {
    calls++; return calls === 1 ? { status: 429, headers: { get: () => '30' } } : { status: 403 };
  } });
  await assert.rejects(api.matches('p'), /Limite/);
  await assert.rejects(api.rank('p'), /Limite/); assert.equal(calls, 1);
  time = 30001; await assert.rejects(api.rank('p'), /Clé HenrikDev refusée/);
  await assert.rejects(api.rank('p'), /Clé HenrikDev refusée/); assert.equal(calls, 2);
});

test('résout le Riot ID chez HenrikDev et transmet son identifiant Valorant aux matchs', async () => {
  const urls = [];
  const puuid = '60325b89-7524-55be-be68-8ab3e7c0f2a3';
  const api = createValorantApi({ key: 'FAKE', sleep: async () => {}, fetchImpl: async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => ({ status: 200,
      data: urls.length === 1 ? { puuid, region: 'eu', name: 'Nom / joueur', tag: 'EU#1' } : [] }) };
  } });
  const account = await api.account('Nom / joueur', 'EU#1');
  await api.matches(account.puuid);
  assert.equal(urls[0], 'https://api.henrikdev.xyz/valorant/v2/account/Nom%20%2F%20joueur/EU%231');
  assert.ok(urls[1].includes(`/eu/pc/${puuid}?`));
});

test('un compte absent, mal formé ou hors Europe ne peut pas être associé', async () => {
  for (const data of [null, {}, { puuid: 'p', name: 'N', tag: 'T', region: 'na' }]) {
    const api = createValorantApi({ key: 'FAKE', sleep: async () => {}, fetchImpl: async () => ({
      ok: true, status: 200, json: async () => ({ status: 200, data }),
    }) });
    await assert.rejects(api.account('N', 'T'), /compte Valorant manquant|Europe/);
  }
});

test('une erreur 400 conserve le motif HenrikDev et masque la clé', async () => {
  const api = createValorantApi({ key: 'SECRET', sleep: async () => {}, fetchImpl: async () => ({
    ok: false, status: 400, json: async () => ({ errors: [{ code: 1, message: 'Invalid UUID SECRET' }] }),
  }) });
  await assert.rejects(api.account('N', 'T'), (err) => {
    assert.match(err.message, /réponse 400.*code 1.*Invalid UUID/);
    assert.ok(!err.message.includes('SECRET')); return true;
  });
});
