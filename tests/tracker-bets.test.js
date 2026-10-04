import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerBets } from '../tracker-bets.js';
function fixture() {
  let time = 1000000; const all = []; const sent = []; let settlements = 0; let refunds = 0;
  const ch = { id: 'c', send: async (payload) => { sent.push(payload); return { id: 'msg' }; },
    messages: { fetch: async () => ({ edit: async () => {} }) } };
  const bets = {
    listBets: () => all,
    createBet: (data) => { const b = { ...data, id: all.length + 1, status: 'open', wagers: [], createdAt: time }; all.push(b); return b; },
    setBetMessage: (b, channelId, messageId) => Object.assign(b, { channelId, messageId }),
    setStatus: (b, status) => { b.status = status; },
    settle: (b, option) => { settlements++; b.status = 'resolved'; b.settlement = { winningOption: option, entries: [] }; },
    refundAll: (b) => { refunds++; b.status = 'cancelled'; },
  };
  const integration = createTrackerBets({ bets, ui: { betEmbed: () => ({}), betComponents: () => [], settlementEmbed: () => ({}) },
    persist: () => {}, botId: () => 'bot', now: () => time });
  return { integration, all, sent, ch, client: { channels: { fetch: async () => ch } },
    advance: (n) => { time += n; }, settles: () => settlements, refunds: () => refunds };
}
const player = { discordId: 'd', puuid: 'p', riotId: 'Player#EUW' };
const result = (remake = false) => ({ info: { gameEndTimestamp: 1100000, gameDuration: remake ? 120 : 1800,
  participants: [{ puuid: 'p', win: true, gameEndedInEarlySurrender: remake }] } });

test('un seul pari par joueur et match, fermeture à échéance, règlement unique', async () => {
  const f = fixture();
  await f.integration.start('g', player, { gameStartTime: 950000 }, 'EUW1_1', f.ch);
  await f.integration.start('g', player, { gameStartTime: 950000 }, 'EUW1_1', f.ch);
  assert.equal(f.all.length, 1); assert.equal(f.sent.length, 1);
  assert.equal(f.all[0].creatorId, 'bot'); assert.equal(f.all[0].tracker.closeAt, 1120000);
  f.advance(120001); f.integration.closeExpired('g'); assert.equal(f.all[0].status, 'closed');
  const api = { match: async () => result() };
  await f.integration.sync('g', f.client, api); await f.integration.sync('g', f.client, api);
  assert.equal(f.settles(), 1); assert.equal(f.sent.length, 2);
  assert.equal(f.all[0].settlement.winningOption, 'Victoire');
});
test('match détecté tardivement ou sans date : pas de pari créé', async () => {
  const f = fixture();
  await f.integration.start('g', player, { gameStartTime: 800000 }, 'EUW1_1', f.ch);
  await f.integration.start('g', player, { gameStartTime: 0 }, 'EUW1_2', f.ch);
  assert.equal(f.all.length, 0);
});
test('remake remboursé une seule fois', async () => {
  const f = fixture(); await f.integration.start('g', player, { gameStartTime: 950000 }, 'EUW1_1', f.ch);
  const api = { match: async () => result(true) };
  await f.integration.sync('g', f.client, api); await f.integration.sync('g', f.client, api);
  assert.equal(f.refunds(), 1); assert.equal(f.settles(), 0);
});
test('expiration rembourse même si Riot est inaccessible ; pas de double remboursement', async () => {
  const f = fixture(); await f.integration.start('g', player, { gameStartTime: 950000 }, 'EUW1_1', f.ch);
  f.advance(6 * 60 * 60 * 1000);
  const api = { match: async () => { throw new Error('Riot inaccessible'); } };
  await f.integration.sync('g', f.client, api); await f.integration.sync('g', f.client, api);
  assert.equal(f.refunds(), 1);
});
test('état rechargé : règlement sans compte lié et aucun retraitement', async () => {
  const f = fixture(); await f.integration.start('g', player, { gameStartTime: 950000 }, 'EUW1_1', f.ch);
  f.all[0] = JSON.parse(JSON.stringify(f.all[0]));
  await f.integration.sync('g', f.client, { match: async () => result() });
  assert.equal(f.settles(), 1);
});
