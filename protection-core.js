export const TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

export function exemption(message, settings) {
  if (!message.guildId || !message.author || message.author.bot || message.webhookId) return 'bot ou webhook';
  if (message.author.id === message.guild?.ownerId) return 'propriétaire';
  if (settings.exemptRoleIds?.some((id) => message.member?.roles.cache.has(id))) return 'rôle exempté';
  return null;
}

// Le timeout ne dépend jamais de la réussite de la copie ou de la suppression.
export async function enforceProtection({ message, reason, snapshot, log, mode = 'auto',
  beforeDelete = () => {}, deleteFailed = () => {}, capture = async () => {}, now = Date.now }) {
  const result = { reason, mode, timeout: false, deleted: false, failures: [] };
  if (mode === 'alert') { await log(snapshot, result); return result; }
  let member = message.member;
  if (!member) { try { member = await message.guild.members.fetch(message.author.id); } catch { /* log ci-dessous */ } }
  if (!member?.moderatable) result.failures.push('Timeout impossible : permissions, hiérarchie, administrateur ou membre absent.');
  else {
    try {
      // Ne jamais raccourcir un timeout presque identique déjà posé.
      if ((member.communicationDisabledUntilTimestamp || 0) < now() + TIMEOUT_MS - 60_000) {
        await member.timeout(TIMEOUT_MS, reason.slice(0, 400));
      }
      result.timeout = true;
    } catch { result.failures.push('Discord a refusé le timeout.'); }
  }
  try { await capture(snapshot); } catch { result.failures.push('Copie de certaines pièces jointes impossible.'); }
  beforeDelete(message.id);
  try { await message.delete(); result.deleted = true; }
  catch { deleteFailed(message.id); result.failures.push('Suppression du message impossible.'); }
  await log(snapshot, result);
  return result;
}

export function messageSnapshot(message) {
  return { id: message.id, guildId: message.guildId, channelId: message.channelId,
    authorId: message.author?.id || null, authorName: message.author?.tag || message.author?.username || 'Auteur indisponible',
    content: message.content ?? null, createdAt: message.createdTimestamp || null,
    attachments: [...(message.attachments?.values() || [])].map((a) => ({ url: a.url, name: a.name || 'piece-jointe', size: a.size, contentType: a.contentType })),
    embeds: (message.embeds || []).slice(0, 10).map((e) => ({ title: e.title, description: e.description, url: e.url,
      image: e.image?.url, thumbnail: e.thumbnail?.url })),
    stickers: [...(message.stickers?.values() || [])].map((s) => ({ id: s.id, name: s.name })),
  };
}

export function voiceChanges(oldState, newState) {
  const changes = [];
  if (oldState.channelId !== newState.channelId) {
    changes.push(!oldState.channelId ? `Connexion : <#${newState.channelId}>`
      : !newState.channelId ? `Déconnexion : <#${oldState.channelId}>`
      : `Déplacement : <#${oldState.channelId}> → <#${newState.channelId}>`);
  }
  for (const [key, name] of [['serverMute', 'Mute serveur'], ['serverDeaf', 'Sourd serveur'],
    ['selfMute', 'Micro personnel'], ['selfDeaf', 'Son personnel'], ['streaming', 'Partage écran'], ['selfVideo', 'Caméra']]) {
    if (oldState[key] !== newState[key]) changes.push(`${name} : ${newState[key] ? 'activé' : 'désactivé'}`);
  }
  return changes;
}
