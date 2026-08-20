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
  const crateNet = s.crateWon - s.crateSpent;

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
      {
        name: '📦 Caisses',
        value:
          `Ouvertes : **${s.cratesOpened}**\n` +
          `Dépensé : ${money(s.crateSpent)} · Gagné : ${money(s.crateWon)} · XP : **${s.crateXp}**\n` +
          `Bilan caisses : **${crateNet >= 0 ? '+' : ''}${crateNet.toLocaleString('fr-FR')}** ${config.currencySymbol}`,
        inline: false,
      },
      {
        name: '🎒 Inventaire',
        value: SHOP.inventoryList(user).map((e) => {
          const c = SHOP.crateById(e.id);
          return `${c.emoji} ${c.nom} ×**${e.count}**`;
        }).join('  ·  ') || '_vide_',
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

// ===================== BOUTIQUE / CAISSES =====================
import * as SHOP from './shop.js';
import { CRATES, CRATE_REWARDS } from './config.js';

export function shopEmbed(user) {
  const slots = user.shop?.slots ?? [];
  const lines = slots.map((s, i) => {
    const c = SHOP.crateById(s.id);
    const etat = s.bought ? '✅ achetée' : `${money(c.prix)}`;
    return `**${i + 1}.** ${c.emoji} Caisse **${c.nom}** — ${etat}`;
  });

  return new EmbedBuilder()
    .setTitle('🛒 Boutique du jour')
    .setDescription(
      (lines.join('\n') || 'Boutique vide.') +
        `\n\n_3 caisses par jour, renouvelées à 00h00 (${config.timezone})._` +
        `\nLes caisses achetées vont dans ton **/inventaire**.`
    )
    .setFooter({ text: 'Clique pour acheter. Ouvre ensuite depuis /inventaire.' })
    .setColor(0xe67e22);
}

export function shopComponents(user) {
  const slots = user.shop?.slots ?? [];
  const row = new ActionRowBuilder();
  slots.forEach((s, i) => {
    const c = SHOP.crateById(s.id);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop:buy:${i}`)
        .setLabel(`${c.nom} · ${c.prix}`)
        .setEmoji(c.emoji)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!!s.bought)
    );
  });
  return slots.length ? [row] : [];
}

export function inventoryEmbed(user, member) {
  const list = SHOP.inventoryList(user);
  const lines = list.map((e) => {
    const c = SHOP.crateById(e.id);
    return `${c.emoji} Caisse **${c.nom}** ×**${e.count}**  _(valeur ${money(c.prix)})_`;
  });

  return new EmbedBuilder()
    .setTitle(`🎒 Inventaire de ${member.displayName ?? member.username}`)
    .setDescription(lines.join('\n') || "Aucune caisse. Achètes-en dans la `/boutique` !")
    .setFooter(list.length ? { text: 'Clique sur une caisse pour l\'ouvrir.' } : null)
    .setColor(0x1abc9c);
}

// Boutons d'ouverture (une par rareté possédée). own = c'est ton inventaire.
export function inventoryComponents(user, own) {
  if (!own) return [];
  const list = SHOP.inventoryList(user);
  const rows = [];
  let row = new ActionRowBuilder();
  list.forEach((e, i) => {
    if (i > 0 && i % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    const c = SHOP.crateById(e.id);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`inv:open:${e.id}`)
        .setLabel(`Ouvrir ${c.nom} (${e.count})`)
        .setEmoji(c.emoji)
        .setStyle(ButtonStyle.Primary)
    );
  });
  if (row.components.length) rows.push(row);
  return rows;
}

// Résultat d'ouverture (public). opener = GuildMember qui a ouvert.
export function crateResultEmbed(openerMember, openedId, result) {
  const opened = SHOP.crateById(openedId);

  const etapes = result.chain.map((step) => {
    const c = SHOP.crateById(step.crateId);
    if (step.kind === 'coins') return `${c.emoji} ${c.nom} → ${money(step.coins)}`;
    if (step.kind === 'xp') return `${c.emoji} ${c.nom} → ✨ **+${step.xp} XP**`;
    if (step.kind === 'upgrade') {
      const nxt = SHOP.crateById(step.nextId);
      return `${c.emoji} ${c.nom} → 🎁 caisse **${nxt?.nom ?? '?'}** !`;
    }
    return `${c.emoji} ${c.nom} → 💨 rien`;
  });

  const gagnePiece = result.totalCoins > 0;
  const gagneXp = result.totalXp > 0;
  const titre = gagnePiece
    ? '🎉 Gagné !'
    : gagneXp
    ? '✨ Gain d\'XP !'
    : '💨 Pas de chance…';

  let desc = etapes.join('\n') + '\n';
  if (gagnePiece) desc += `\nPièces reçues : ${money(result.totalCoins)}`;
  if (gagneXp) desc += `\nXP reçue : **+${result.totalXp}**`;
  if (result.xpGain?.levelUp) desc += `\n🎉 Niveau **${result.xpGain.level}** atteint !`;

  return new EmbedBuilder()
    .setAuthor({
      name: `${openerMember.displayName ?? openerMember.username} a ouvert une caisse ${opened.nom}`,
      iconURL: openerMember.displayAvatarURL?.() ?? undefined,
    })
    .setTitle(`${opened.emoji} ${titre}`)
    .setDescription(desc)
    .setColor(opened.couleur);
}

// Tableau des probabilités de toutes les caisses.
export function cratesInfoEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🎲 Probabilités des caisses')
    .setDescription('Le montant est ce que tu **reçois** (ton gain net = montant − prix payé).')
    .setColor(0xe67e22);

  for (const c of CRATES) {
    const lignes = CRATE_REWARDS.map((o) => {
      const pc = `${(o.p * 100).toFixed(0)}%`.padStart(3);
      if (o.kind === 'coins') return `\`${pc}\` ${Math.floor(c.prix * o.mult)} 🪙`;
      if (o.kind === 'xp') return `\`${pc}\` +${o.xp} XP`;
      if (o.kind === 'nothing') return `\`${pc}\` rien`;
      // upgrade
      if (c.id === 'mythique') return `\` 5%\` ${Math.floor(c.prix * 1.75)} 🪙 (+75%)`;
      const nxt = SHOP.nextCrate(c.id);
      return `\`${pc}\` caisse ${nxt?.nom ?? '?'} 🎁`;
    });
    embed.addFields({ name: `${c.emoji} ${c.nom} — ${c.prix} 🪙`, value: lignes.join('\n'), inline: true });
  }
  return embed;
}
