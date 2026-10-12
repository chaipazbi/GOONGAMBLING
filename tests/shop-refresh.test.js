import test from 'node:test';
import assert from 'node:assert/strict';
import { newShop, refreshShop, shopRevision } from '../shop-refresh.js';

test('renouvellement à 5K, trois nouveaux emplacements, caisses détenues et achats objets conservés',()=>{
  const user={balance:6000,crates:{rare:2},itemBuys:{rewind:{date:'d',count:1}},shop:newShop('d',()=>['commun','rare','epique'])};
  const old=shopRevision(user);
  assert.equal(refreshShop(user,old,'d',()=>['mythique','commun','commun']).ok,true);
  assert.equal(user.balance,1000);assert.equal(user.shop.slots.length,3);assert.ok(user.shop.slots.every(s=>!s.bought));
  assert.notEqual(shopRevision(user),old);assert.equal(user.crates.rare,2);assert.equal(user.itemBuys.rewind.count,1);
  assert.deepEqual(refreshShop(user,old,'d',()=>[]),{ok:false,reason:'stale'});assert.equal(user.balance,1000);
});
test('solde insuffisant et boutique périmée : aucun débit ni tirage',()=>{
  const user={balance:4999,shop:newShop('d',()=>['commun'])};const old=user.shop;
  assert.deepEqual(refreshShop(user,shopRevision(user),'d',()=>{throw Error('pas de tirage')}),{ok:false,reason:'balance'});
  assert.equal(user.balance,4999);assert.equal(user.shop,old);
  user.balance=6000;assert.equal(refreshShop(user,shopRevision(user),'lendemain',()=>[]).reason,'stale');assert.equal(user.balance,6000);
});
test('une boutique existante sans révision peut être renouvelée, anciens boutons deviennent périmés',()=>{
  const user={balance:10000,shop:{date:'d',slots:[]}};
  assert.equal(refreshShop(user,'d','d',()=>['commun']).ok,true);
  assert.equal(refreshShop(user,'d','d',()=>['rare']).reason,'stale');assert.equal(user.balance,5000);
});
