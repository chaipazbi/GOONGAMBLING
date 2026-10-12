import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
const testPath=resolve(`tests/.casino-ui-${process.pid}.json`);
process.env.DATA_PATH=testPath;
const ui=await import('../ui.js');
const xui=await import('../extra-ui.js');
const {commands}=await import('../commands.js');
after(()=>rmSync(testPath,{force:true}));
const user={balance:50000,crates:{commun:2,rare:1,epic:1,legendaire:1,mythique:1},items:{potion_coins:1,potion_xp:1,rewind:1},buffs:{coins2x:true},
  shop:{date:'d',revision:'revision-test',slots:[{id:'commun',bought:false},{id:'rare',bought:false},{id:'epic',bought:true}]}};
const member={displayName:'Joueur'};

test('boutique réunie : caisses, achats des objets et renouvellement daté',()=>{
  const e=ui.shopEmbed(user).toJSON();assert.match(e.fields[0].value,/Potion ×2 pièces/);
  const rows=ui.shopComponents(user).map(r=>r.toJSON());assert.equal(rows.length,3);
  const buttons=rows.flatMap(r=>r.components);assert.ok(buttons.some(b=>b.custom_id==='obj:buy:potion_coins'));
  assert.ok(buttons.some(b=>b.custom_id==='shop:reroll:revision-test'));
  assert.ok(buttons.some(b=>b.custom_id==='shop:buy:0:revision-test'));
  assert.ok(rows.every(r=>r.components.length<=5));
});
test('inventaire réuni : ouverture des caisses et utilisation des objets, sans achat',()=>{
  const e=ui.inventoryEmbed(user,member).toJSON();assert.equal(e.fields.length,3);assert.match(e.fields[1].value,/Potion/);
  assert.match(e.fields[2].value,/×2 pièces/);
  const buttons=ui.inventoryComponents(user,true).flatMap(r=>r.toJSON().components);
  assert.equal(buttons.filter(b=>b.custom_id.startsWith('inv:open:')).length,5);
  assert.ok(buttons.find(b=>b.custom_id==='obj:arm:potion_coins').disabled);
  assert.ok(!buttons.some(b=>b.custom_id.startsWith('obj:buy:')));
  assert.deepEqual(ui.inventoryComponents(user,false),[]);
});
test('commande objets supprimée du déploiement, inventaire et boutique conservés',()=>{
  assert.ok(!commands.some(c=>c.name==='objets'));assert.ok(commands.some(c=>c.name==='inventaire'));assert.ok(commands.some(c=>c.name==='boutique'));
});
test('récapitulatif de 100 tirages reste sous la limite Discord et compte les bonus',()=>{
  const rounds=Array.from({length:100},()=>({result:{reels:['🍒','🍒','🍒'],gain:15000},effect:{bonus:1000,xp:50,extra:'bonus'}}));
  const embed=xui.slotsSeriesEmbed(member,5000,rounds).toJSON();assert.ok(embed.description.length<=4096);
  assert.match(embed.description,/100 tirages/);assert.match(embed.description,/5000/);
});
