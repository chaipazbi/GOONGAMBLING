// Construction des messages : embeds et boutons.
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { config, money } from './config.js';
import * as B from './bets.js';
import * as L from './levels.js';

const STATUS_LABEL = {
  open: '🟢 Ouvert aux mises',
  closed: '🔒 Verrouillé',
  resolved: '✅ Clôturé',
  cancelled: '❌ Remboursé',
};
const STATUS_COLOR = {
  open: 0x3498db,
  closed: 0xe67e22,
  resolved: 0x2ecc71,
  cancelled: 0x95a5a6,
};

export function betEmbed(bet) {
  const p = B.pools(bet);
  const gagnante = bet.settlement?.winningOption ?? null;

  const lines = bet.options.map((o, i) => {
    const marque = o === gagnante ? '🏆 ' : '';
    return `**${i + 1}.** ${marque}${o} — cote **${B.oddsLabel(bet, o)}** · cagnotte ${money(p[o] || 0)}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎲 Pari #${bet.id} — ${bet.title}`)
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Statut', value: STATUS_LABEL[bet.status], inline: true },
      { name: 'Cagnotte totale', value: money(B.totalPool(bet)), inline: true },
      { name: 'Parieurs', value: `${new Set(bet.wagers.map((w) => w.userId)).size}`, inline: true }
    )
    .setColor(STATUS_COLOR[bet.status]);

  if (bet.status === 'open') {
    embed.setFooter({ text: `Mise de départ de la maison : ${bet.seed} par issue` });
  }
  if (gagnante) {
    embed.setFooter({ text: `Résultat : ${gagnante}` });
  }
  return embed;
}

export function betComponents(bet) {
  const rows = [];

  // Boutons de mise (uniquement tant que le pari est ouvert)
  if (bet.status === 'open') {
    let row = new ActionRowBuilder();
    bet.options.forEach((opt, i) => {
      if (i > 0 && i % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder();
      }
      const base = opt.length > 60 ? opt.slice(0, 59) + '…' : opt;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`pari:wager:${bet.id}:${i}`)
          .setLabel(`${base} · ${B.oddsLabel(bet, opt)}`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    rows.push(row);
  }

  const admin = new ActionRowBuilder();

  if (bet.status === 'open' || bet.status === 'closed') {
    if (bet.status === 'open') {
      admin.addComponents(
        new ButtonBuilder()
          .setCustomId(`pari:lock:${bet.id}`)
          .setLabel('🔒 Verrouiller')
          .setStyle(ButtonStyle.Secondary)
      );
    }
    admin.addComponents(
      new ButtonBuilder()
        .setCustomId(`pari:close:${bet.id}`)
        .setLabel('🏆 Clôturer')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`pari:refund:${bet.id}`)
        .setLabel('🔄 Rembourser')
        .setStyle(ButtonStyle.Danger)
    );
  } else if (bet.status === 'resolved') {
    admin.addComponents(
      new ButtonBuilder()
        .setCustomId(`pari:fix:${bet.id}`)
        .setLabel('✏️ Corriger le résultat')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`pari:refund:${bet.id}`)
        .setLabel('🔄 Rembourser')
        .setStyle(ButtonStyle.Danger)
    );
  }

  if (admin.components.length) rows.push(admin);
  return rows;
}

export function winnerSelect(bet, action = 'winner') {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`pari:${action}:${bet.id}`)
    .setPlaceholder("Choisis l'issue gagnante…")
    .addOptions(
      bet.options.map((o, i) => ({
        label: o.slice(0, 100),
        value: String(i),
        default: bet.settlement?.winningOption === o,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}

export function settlementEmbed(bet) {
  const s = bet.settlement;
  const gagnants = s.entries.filter((e) => e.kind === 'win');
  const rembourses = s.entries.filter((e) => e.kind === 'refund');

  let desc = `Issue gagnante : **${s.winningOption}**\n`;
  if (s.ratio) desc += `Cote finale : **${s.ratio.toFixed(2)}** · cagnotte ${money(s.total)}\n`;

  if (gagnants.length) {
    desc +=
      '\n' +
      gagnants
        .sort((a, b) => b.coins - a.coins)
        .map(
          (e) =>
            `<@${e.userId}> — misé ${money(e.stake)} → reçoit ${money(e.coins)} (**+${e.net.toLocaleString('fr-FR')}**, +${e.xp} XP)`
        )
        .join('\n');
  } else if (rembourses.length) {
    desc += "\nPersonne n'avait misé sur cette issue : toutes les mises ont été remboursées.";
  } else {
    desc += "\nPersonne n'avait misé.";
  }

  return new EmbedBuilder()
    .setTitle(`✅ Pari #${bet.id} clôturé — ${bet.title}`)
    .setDescription(desc)
    .setColor(0x2ecc71);
}

export function profilEmbed(user, member) {
  const p = L.levelProgress(user.xp);
  const s = user.stats;
  const decided = s.betsWon + s.betsLost;
  const net = s.totalWon - s.totalLost;

  return new EmbedBuilder()
    .setTitle(`📊 Profil de ${member.displayName ?? member.username}`)
    .setThumbnail(member.displayAvatarURL?.() ?? null)
    .addFields(
      {
        name: `Niveau ${p.level}`,
        value: `${L.progressBar(p.into, p.span)} ${p.into}/${p.span} XP\nTotal : **${user.xp}** XP · encore ${p.remaining} pour le niveau ${p.level + 1}`,
      },
      {
        name: '🎯 Paris',
        value:
          `Joués : **${s.betsPlayed}** · Gagnés : **${s.betsWon}** · Perdus : **${s.betsLost}**\n` +
          `Ratio V/D : **${L.ratioWL(s)}** · Taux de victoire : **${decided ? L.winRate(s).toFixed(1) : '0.0'}%**`,
        inline: false,
      },
      {
        name: '💰 Pièces',
        value:
          `Misé au total : ${money(s.totalStaked)}\n` +
          `Gagné : ${money(s.totalWon)} · Perdu : ${money(s.totalLost)}\n` +
          `Bilan : **${net >= 0 ? '+' : ''}${net.toLocaleString('fr-FR')}** ${config.currencySymbol}`,
        inline: false,
      },
      { name: '👛 Solde actuel', value: money(user.balance), inline: true },
      {
        name: '⏰ Daily auto',
        value: user.autoDaily ? `activé à **${user.autoDaily}**` : 'désactivé',
        inline: true,
      }
    )
    .setColor(0x9b59b6);
}

export function leaderboardEmbed(entries, kind) {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = entries.map((e, i) => {
    const rank = medals[i] || `**${i + 1}.**`;
    const valeur =
      kind === 'xp'
        ? `niveau **${L.levelFromXp(e.xp)}** — ${e.xp} XP`
        : money(e.balance);
    return `${rank} <@${e.id}> — ${valeur}`;
  });

  return new EmbedBuilder()
    .setTitle(kind === 'xp' ? '🏅 Classement — Niveaux' : `🏆 Classement — ${config.currencyName}`)
    .setDescription(lines.join('\n') || 'Aucun joueur pour le moment.')
    .setColor(kind === 'xp' ? 0x9b59b6 : 0xf1c40f);
}
