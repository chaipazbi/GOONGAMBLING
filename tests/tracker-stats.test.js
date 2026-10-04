import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, statsEmbed, historyEmbed } from '../tracker-stats.js';
const m = (id, champion, kills, deaths, assists, win, extra = {}) => ({ metadata: { matchId: id }, info: {
  gameStartTimestamp: 1000000, gameDuration: 1200, queueId: 420,
  participants: [{ puuid: 'me', championName: champion, kills, deaths, assists, win, ...extra }],
} });
test('totaux et champions calculés sur le joueur ciblé, remakes exclus', () => {
  const matches = [m('a', 'Ahri', 10, 2, 5, true), m('b', 'Ahri', 2, 6, 3, false), m('c', 'Lux', 3, 0, 7, true)];
  const other = m('d', 'Garen', 99, 1, 2, true); other.info.participants[0].puuid = 'other'; matches.push(other);
  const early = m('e', 'Lux', 0, 1, 0, false, { gameEndedInEarlySurrender: true }); early.info.gameDuration = 180; matches.push(early);
  const s = summarize(matches, 'me');
  assert.deepEqual([s.total, s.remakes, s.wins, s.kills, s.deaths, s.assists], [3, 1, 2, 15, 8, 15]);
  assert.equal(s.champions[0].name, 'Ahri'); assert.equal(s.champions[0].games, 2);
  const embed = statsEmbed(matches, 'me', 'Me#EUW', 20);
  assert.equal(embed.fields.find((f) => f.name.startsWith('K/D ')).value, '1,88');
});
test('zéro mort et zéro partie : aucun NaN ni division par zéro', () => {
  const e = statsEmbed([m('a', 'Lux', 3, 0, 1, true)], 'me', 'Me#EUW', 1);
  assert.match(e.fields[2].value, /∞/);
  assert.ok(!JSON.stringify(statsEmbed([], 'me', 'Me#EUW', 20)).includes('NaN'));
});
test('historique conserve l’ordre Riot et respecte la limite de dix résultats', () => {
  const matches = Array.from({ length: 12 }, (_, i) => m(String(i), 'Ahri', i, 1, 2, i % 2 === 0));
  const e = historyEmbed(matches, 'me', 'Me#EUW', 10);
  assert.equal(e.fields.length, 10); assert.match(e.fields[0].value, /Match 0$/);
  assert.match(e.fields[1].name, /Défaite/);
  assert.ok(JSON.stringify(e).length < 6000);
});
