// Messages de bienvenue / au revoir + rendu des embeds.
import { EmbedBuilder } from 'discord.js';

// Remplace les variables dans un modèle de message.
// {membre} = mention · {pseudo} = nom affiché · {serveur} = nom du serveur · {membres} = nombre de membres
export function formatTemplate(tpl, member, guild) {
  const pseudo = member.displayName ?? member.user?.username ?? 'membre';
  return String(tpl)
    .replaceAll('{membre}', `<@${member.id}>`)
    .replaceAll('{pseudo}', pseudo)
    .replaceAll('{serveur}', guild.name)
    .replaceAll('{membres}', String(guild.memberCount ?? '?'));
}

export function isValidImageUrl(url) {
  if (!url) return false;
  return /^https?:\/\/.+/i.test(url);
}

// Construit le message envoyé (embed + éventuelle mention hors embed pour notifier).
export function buildJoinPayload(settings, member, guild) {
  const desc = formatTemplate(settings.message, member, guild);
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setDescription(desc)
    .setThumbnail(member.user?.displayAvatarURL?.() ?? null);
  if (isValidImageUrl(settings.imageUrl)) embed.setImage(settings.imageUrl);
  // On mentionne le membre hors embed pour qu'il reçoive la notification.
  return { content: `<@${member.id}>`, embeds: [embed] };
}

export function buildLeavePayload(settings, member, guild) {
  const desc = formatTemplate(settings.message, member, guild);
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setDescription(desc)
    .setThumbnail(member.user?.displayAvatarURL?.() ?? null);
  if (isValidImageUrl(settings.imageUrl)) embed.setImage(settings.imageUrl);
  return { embeds: [embed] };
}

// Aperçu (pour la commande) : identique mais sans la mention qui ping.
export function previewPayload(kind, settings, member, guild) {
  const p = kind === 'join' ? buildJoinPayload(settings, member, guild) : buildLeavePayload(settings, member, guild);
  return { embeds: p.embeds, ephemeral: true };
}
