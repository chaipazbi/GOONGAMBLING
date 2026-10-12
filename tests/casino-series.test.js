import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrder, runSeries, resolveLobbySeries, seriesTotals } from '../casino-series.js';
import { resolveBet } from '../roulette.js';

test('5K × 10 exige 50K dès le départ, plafond appliqué par tirage', () => {
  assert.deepEqual(parseOrder('5K','10',50000),{amount:5000,count:10,cost:50000});
  assert.ok(parseOrder('5000','10',49999).err);
  assert.equal(parseOrder('50K','100',5000000).cost,5000000);
  assert.ok(parseOrder('50001','1',100000).err);
});
test('all répartit le solde sur la série sans dépasser le plafond',()=>{
  assert.deepEqual(parseOrder('all','10',75000),{amount:7500,count:10,cost:75000});
  assert.equal(parseOrder('all','2',200000).amount,50000);
});
test('ancien formulaire : un tirage ; entrées partielles, négatives et décimales de tirage rejetées',()=>{
  assert.equal(parseOrder('5000','',5000).count,1);
  for(const [bet,count] of [['5000abc','1'],['1e3','1'],['-50','1'],['5000','0'],['5000','101'],['5000','1.5'],['5000','10K']])assert.ok(parseOrder(bet,count,1000000).err);
});
test('débit global avant tout résultat, exactement N règlements individuels',()=>{
  let balance=50000;const calls=[];
  const order=parseOrder('5k','10',balance);
  const rounds=runSeries(order,{debit:(cost)=>{balance-=cost;calls.push('debit')},draw:(amount,i)=>{
    if(i===0)assert.equal(balance,0);calls.push('draw');return {gain:amount*2};
  },settle:(_,r)=>{balance+=r.gain;calls.push('settle');return {bonus:0}}});
  assert.equal(rounds.length,10);assert.equal(balance,100000);assert.equal(calls[0],'debit');
  assert.equal(calls.filter(c=>c==='settle').length,10);
});
test('roulette : résultats partagés, séries de longueurs différentes sans tour gratuit',()=>{
  const bets=[{userId:'a',type:'rouge',amount:5000,count:3},{userId:'b',type:'noir',amount:2000,count:1}];
  let n=0;const processed=[];
  const rounds=resolveLobbySeries(bets,{draw:()=>[1,2,3][n++],payout:resolveBet,settleRound:(p)=>processed.push(p)});
  assert.equal(n,3);assert.equal(processed[0].length,2);assert.equal(processed[1].length,1);
  const totals=seriesTotals(rounds);assert.equal(totals.find(p=>p.userId==='a').amount,15000);
  assert.equal(totals.find(p=>p.userId==='a').total,22000);assert.equal(totals.find(p=>p.userId==='b').amount,2000);
});
test('anciens paris de lobby sans count restent limités à un tour',()=>{
  const rounds=resolveLobbySeries([{userId:'a',amount:100}],{draw:()=>0,payout:()=>0,settleRound:()=>{}});
  assert.equal(rounds.length,1);assert.equal(seriesTotals(rounds)[0].amount,100);
});
