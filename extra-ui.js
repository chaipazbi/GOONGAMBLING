// Interfaces : machine à sous, objets, missions.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { money, config } from './config.js';
import { SYMBOLS } from './slots.js';
import { ITEMS, itemList, itemCount, hasBuff } from './items.js';
import { catalogInfo } from './missions.js';
import { progressBar } from './levels.js';

const btn = (id, label, style = ButtonStyle.Secondary, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
};

// ---------------- SLOTS ----------------
export function slotsMenu() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🎰 Machine à sous')
        .setDescription('Aligne des symboles pour gagner ! Mise, tire, et croise les doigts.')
        .setColor(0x9b59b6),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        btn('slots:play', 'Jouer', ButtonStyle.Success, '🎰'),
        btn('slots:rules', 'Gains', ButtonStyle.Secondary, '📊')
      ),
    ],
  };
}

export function slotsRulesEmbed() {
  const lignes = SYMBOLS.map((s) => `${s.e}  ×3 = **${s.x3}×** la mise · ×2 = ${s.x2}×`);
  return new EmbedBuilder()
    .setTitle('🎰 Machine à sous — gains')
    .setDescription(
      'Trois symboles identiques = gros gain, deux identiques = petit gain.\n\n' +
        lignes.join('\n') +
        '\n\n_Gain = mise × multiplicateur._'
    )
    .setColor(0x9b59b6);
}

export function slotsResultEmbed(member, bet, res, extra) {
  const net = res.gain - bet;
  const titre = res.gain === 0 ? '😬 Perdu' : net > 0 ? '🎉 Gagné !' : '↩️ Petit gain';
  let desc = `# ${res.reels.join(' ')}\n\n`;
  if (res.gain > 0) desc += `Gain : ${money(res.gain)} (×${res.mult}) — bilan **${net >= 0 ? '+' : ''}${net.toLocaleString('fr-FR')}** ${config.currencySymbol}`;
  else desc += `Tu perds ta mise de ${money(bet)}.`;
  if (extra) desc += `\n${extra}`;
  return new EmbedBuilder()
    .setAuthor({ name: `${member.displayName ?? member.username} joue aux slots`, iconURL: member.displayAvatarURL?.() ?? undefined })
    .setTitle(titre)
    .setDescription(desc)
    .setColor(res.gain === 0 ? 0xe74c3c : net > 0 ? 0x2ecc71 : 0x95a5a6);
}

// ---------------- OBJETS ----------------
export function objetsEmbed(user, member) {
  const inv = itemList(user).map((e) => `${ITEMS[e.id].emoji} ${ITEMS[e.id].nom} ×**${e.count}**`).join('\n') || '_aucun objet_';
  const buffs = [];
  if (hasBuff(user, 'coins2x')) buffs.push('🧪 ×2 pièces armée');
  if (hasBuff(user, 'xp2x')) buffs.push('📗 ×2 XP armée');
  const boutique = Object.entries(ITEMS).map(([id, it]) => `${it.emoji} **${it.nom}** — ${money(it.prix)}\n_${it.desc}_`).join('\n');

  return new EmbedBuilder()
    .setTitle(`🎒 Objets de ${member.displayName ?? member.username}`)
    .addFields(
      { name: 'Ton inventaire', value: inv, inline: false },
      { name: 'Effets actifs', value: buffs.join(' · ') || '_aucun_', inline: false },
      { name: '🛒 Boutique', value: boutique, inline: false }
    )
    .setColor(0x1abc9c);
}

export function objetsComponents(user, own) {
  if (!own) return [];
  const achat = new ActionRowBuilder().addComponents(
    btn('obj:buy:potion_coins', 'Acheter ×2 pièces', ButtonStyle.Secondary, '🧪'),
    btn('obj:buy:potion_xp', 'Acheter ×2 XP', ButtonStyle.Secondary, '📗'),
    btn('obj:buy:rewind', 'Acheter Retour', ButtonStyle.Secondary, '⏪')
  );
  const usage = new ActionRowBuilder().addComponents(
    btn('obj:arm:potion_coins', 'Utiliser ×2 pièces', ButtonStyle.Primary, '🧪').setDisabled(itemCount(user, 'potion_coins') < 1 || hasBuff(user, 'coins2x')),
    btn('obj:arm:potion_xp', 'Utiliser ×2 XP', ButtonStyle.Primary, '📗').setDisabled(itemCount(user, 'potion_xp') < 1 || hasBuff(user, 'xp2x')),
    btn('obj:rewind', 'Retour arrière', ButtonStyle.Danger, '⏪').setDisabled(itemCount(user, 'rewind') < 1)
  );
  return [achat, usage];
}

// ---------------- MISSIONS ----------------
export function missionsEmbed(missions, member) {
  const lignes = missions.list.map((m, i) => {
    const done = m.progress >= m.cible;
    const etat = m.claimed ? '✅ récupérée' : done ? '🎁 à récupérer !' : `${progressBar(m.progress, m.cible, 10)} ${m.progress}/${m.cible}`;
    return `**${i + 1}. ${m.texte}**\n${etat} — récompense : ${money(m.coins)} + ${m.xp} XP`;
  });
  return new EmbedBuilder()
    .setTitle(`🎯 Missions du jour — ${member.displayName ?? member.username}`)
    .setDescription(lignes.join('\n\n') + '\n\n_Nouvelles missions chaque jour à minuit._')
    .setColor(0xf1c40f);
}

export function missionsComponents(missions) {
  const rows = [];
  const claim = new ActionRowBuilder();
  let any = false;
  missions.list.forEach((m, i) => {
    if (m.progress >= m.cible && !m.claimed) {
      any = true;
      claim.addComponents(btn(`miss:claim:${i}`, `Récupérer #${i + 1}`, ButtonStyle.Success, '🎁'));
    }
  });
  if (any) rows.push(claim);
  rows.push(new ActionRowBuilder().addComponents(btn('miss:catalog', 'Voir toutes les quêtes possibles', ButtonStyle.Secondary, '📜')));
  return rows;
}

export function missionsCatalogEmbed() {
  const lignes = catalogInfo().map((c) => `**${c.nom}** — objectif ${c.objectif} → ${c.recompense}`);
  return new EmbedBuilder()
    .setTitle('📜 Toutes les quêtes possibles')
    .setDescription(
      'Chaque jour, **3 missions** sont tirées au hasard parmi celles-ci (reset à minuit).\n' +
        "L'objectif est tiré dans une fourchette, et la récompense grimpe avec l'objectif.\n\n" +
        lignes.join('\n')
    )
    .setColor(0xf1c40f);
}
