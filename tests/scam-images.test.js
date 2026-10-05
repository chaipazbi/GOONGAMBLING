import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { fingerprint, matchFingerprint, compareFingerprint, builtinImages, isDiscordMedia, downloadMedia } from '../scam-images.js';

async function fixture() {
  const pixels=Buffer.alloc(128*96*3);
  for(let y=0;y<96;y++)for(let x=0;x<128;x++){
    const at=(y*128+x)*3;
    pixels[at]=Math.round(x*255/127);pixels[at+1]=Math.round(y*255/95);
    pixels[at+2]=x>20&&x<100&&y>25&&y<70?220:40;
  }
  return sharp(pixels,{raw:{width:128,height:96,channels:3}}).png().toBuffer();
}
test('douze images fournies intégrées comme références valides',()=>{
  assert.equal(builtinImages.length,12);
  for(const r of builtinImages){assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.equal(r.dhash.length,256);assert.equal(Buffer.from(r.grid,'base64').length,768);}
});
test('copies exactes et versions redimensionnées/recompressées reconnues',async()=>{
  const input=await fixture();const ref={id:'test',...await fingerprint(input)};
  assert.equal(matchFingerprint(await fingerprint(input),[ref]).exact,true);
  const changed=await sharp(input).resize(256,192).jpeg({quality:75}).toBuffer();
  assert.ok(compareFingerprint(await fingerprint(changed),ref));
});
test('image différente non sanctionnée par le simple nom du fichier ou des pixels uniformes',async()=>{
  const benign=await sharp({create:{width:160,height:120,channels:3,background:'#0088ff'}}).png().toBuffer();
  assert.equal(matchFingerprint(await fingerprint(benign),builtinImages),null);
});
test('contenu invalide ou fichier trop volumineux rejeté',async()=>{
  await assert.rejects(fingerprint(Buffer.from('ceci n’est pas une image')));
  await assert.rejects(fingerprint(Buffer.alloc(8*1024*1024+1)),/8 Mio/);
});
test('téléchargements limités aux pièces jointes Discord, sans redirections',async()=>{
  const valid='https://cdn.discordapp.com/attachments/1/2/a.png'; assert.equal(isDiscordMedia(valid),true);
  for(const url of ['https://127.0.0.1/a','http://cdn.discordapp.com/attachments/a','https://cdn.discordapp.com.evil.test/attachments/a','https://cdn.discordapp.com:444/attachments/a','https://cdn.discordapp.com/api']){
    assert.equal(isDiscordMedia(url),false);
    await assert.rejects(downloadMedia(url,{fetchImpl:async()=>{throw Error('ne doit pas être appelé')}}),/Discord/);
  }
  const data=await downloadMedia(valid,{fetchImpl:async(_,options)=>{
    assert.equal(options.redirect,'error');return new Response(Buffer.from('abcd'));
  }});assert.equal(data.toString(),'abcd');
});
test('limite contrôlée aussi sur le flux sans Content-Length',async()=>{
  await assert.rejects(downloadMedia('https://cdn.discordapp.com/attachments/1/2/a.png',{maxBytes:3,
    fetchImpl:async()=>new Response(new ReadableStream({start(c){c.enqueue(Buffer.from('abcd'));c.close()}}))}),/volumineuse/);
});
