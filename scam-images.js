import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Empreintes seules dans le dépôt et data.json, aucun accès à un service payant.
export const builtinImages = JSON.parse(readFileSync(new URL('./scam-images.json', import.meta.url), 'utf8'));
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
sharp.cache(false);
sharp.concurrency(1);

export async function fingerprint(buffer) {
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Image vide ou supérieure à 8 Mio.');
  const input = sharp(buffer, { limitInputPixels: 20_000_000, failOn: 'error', animated: false }).rotate();
  const meta = await input.metadata();
  if (!['jpeg', 'png', 'webp', 'gif', 'avif'].includes(meta.format)) throw new Error('Format image non pris en charge.');
  // Première image pour les GIF ; les autres frames ne sont pas analysées.
  const grid = await input.clone().flatten({ background: '#ffffff' }).resize(16, 16, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const gray = await input.clone().flatten({ background: '#ffffff' }).resize(17, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
  let dhash = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) dhash += gray[y * 17 + x] > gray[y * 17 + x + 1] ? '1' : '0';
  return { sha256: createHash('sha256').update(buffer).digest('hex'), dhash,
    grid: grid.toString('base64'), aspect: meta.width / (meta.pageHeight || meta.height) };
}

export function compareFingerprint(candidate, reference) {
  if (candidate.sha256 === reference.sha256) return { exact: true, distance: 0, difference: 0 };
  if (!candidate.dhash || candidate.dhash.length !== reference.dhash?.length
    || Math.abs(Math.log(candidate.aspect / reference.aspect)) > 0.10) return null;
  let distance = 0;
  for (let i = 0; i < candidate.dhash.length; i++) if (candidate.dhash[i] !== reference.dhash[i]) distance++;
  const a = Buffer.from(candidate.grid || '', 'base64'); const b = Buffer.from(reference.grid || '', 'base64');
  if (a.length !== 768 || b.length !== 768) return null;
  let difference = 0; for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i]);
  difference /= a.length;
  // Les gradients faibles changent après recompression : tolérance sur dHash,
  // mais la grille couleur et le ratio restent proches pour éviter les matches vagues.
  return distance <= 40 && difference <= 8 ? { exact: false, distance, difference } : null;
}

export function matchFingerprint(candidate, references) {
  for (const reference of references) {
    const score = compareFingerprint(candidate, reference);
    if (score) return { reference, ...score };
  }
  return null;
}

export function isDiscordMedia(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443')
      && ['cdn.discordapp.com', 'media.discordapp.net'].includes(u.hostname)
      && u.pathname.startsWith('/attachments/');
  } catch { return false; }
}

export async function downloadMedia(url, { fetchImpl = fetch, maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!isDiscordMedia(url)) throw new Error('Seules les pièces jointes hébergées par Discord sont téléchargées.');
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Pièce jointe indisponible (HTTP ${response.status}).`);
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel(); throw new Error('Pièce jointe trop volumineuse.');
  }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Pièce jointe trop volumineuse.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

export function imageAttachments(message) {
  const candidates = [...(message.attachments?.values() || [])].filter((a) =>
    a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(a.name || a.url));
  // Les aperçus ne sont analysés que s'ils désignent une pièce jointe Discord.
  for (const embed of message.embeds || []) {
    for (const image of [embed.image, embed.thumbnail]) {
      const url = image?.proxyURL || image?.url;
      if (url && isDiscordMedia(url) && !candidates.some((a) => a.url === url)) candidates.push({ url, name: 'apercu.png', contentType: 'image/png' });
    }
  }
  return candidates.slice(0, 10);
}
