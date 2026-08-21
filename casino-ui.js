// Embeds et boutons des mini-jeux (blackjack, roulette, course de chevaux).
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { money, config } from './config.js';
import { handLabel, handValue, isBlackjack } from './cards.js';
import { BJ_INFO, BJ_MIN_MULT, BJ_MAX_MULT } from './blackjack.js';
import { BET_TYPES, colorOf, ROULETTE_INFO } from './roulette.js';

const btn = (id, label, style = ButtonStyle.Secondary, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  return b;
};

// ---------------- BLACKJACK ----------------

export function blackjackMenu() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🃏 Blackjack')
        .setDescription(
          'Affronte le croupier. Approche-toi de 21 sans dépasser.\n' +
            `Victoire payée **× un multiplicateur aléatoire ${BJ_MIN_MULT.toFixed(2)}–${BJ_MAX_MULT.toFixed(2)}**, ` +
            'égalité = mise rendue, défaite = mise perdue.'
        )
        .setColor(0x2ecc71),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        btn('bj:menu:play', 'Jouer', ButtonStyle.Success, '🎮'),
        btn('bj:menu:odds', 'Probabilités', ButtonStyle.Secondary, '📊')
      ),
    ],
  };
}

export function blackjackOddsEmbed() {
  return new EmbedBuilder()
    .setTitle('🃏 Blackjack — probabilités')
    .setDescription(
      `Victoire : **${BJ_INFO.winRate}%** · Égalité : **${BJ_INFO.pushRate}%** · Défaite : **${BJ_INFO.loseRate}%**\n\n` +
        `Gain en cas de victoire : mise × un multiplicateur tiré au hasard entre ` +
        `**${BJ_MIN_MULT.toFixed(2)}** et **${BJ_MAX_MULT.toFixed(2)}**.\n_${BJ_INFO.note}_`
    )
    .setColor(0x2ecc71);
}

export function blackjackGameEmbed(game, member) {
  const done = game.status === 'done';
  const dealer = done ? handLabel(game.dealer) : handLabel(game.dealer, true);
  const dealerVal = done ? handValue(game.dealer) : handValue([game.dealer[0]]);

  const e = new EmbedBuilder()
    .setAuthor({
      name: `Blackjack de ${member.displayName ?? member.username}`,
      iconURL: member.displayAvatarURL?.() ?? undefined,
    })
    .addFields(
      { name: 'Croupier', value: `${dealer}  (**${dealerVal}${done ? '' : '+'}**)`, inline: false },
      { name: 'Toi', value: `${handLabel(game.player)}  (**${handValue(game.player)}**)`, inline: false }
    )
    .setFooter({ text: `Mise : ${game.bet} ${config.currencySymbol}` });

  if (!done) {
    e.setTitle('🃏 À toi de jouer').setColor(0x3498db);
    return e;
  }

  // Résultat
  const map = {
    blackjack: ['🃏 BLACKJACK !', 0xf1c40f],
    win: ['🎉 Gagné !', 0x2ecc71],
    push: ['🤝 Égalité', 0x95a5a6],
    lose: ['💥 Perdu', 0xe74c3c],
  };
  const [titre, couleur] = map[game.outcome] || ['Terminé', 0x95a5a6];
  e.setTitle(titre).setColor(couleur);

  let ligne;
  if (game.outcome === 'lose') ligne = `Tu perds ta mise de ${money(game.bet)}.`;
  else if (game.outcome === 'push') ligne = `Mise rendue : ${money(game.payout)}.`;
  else ligne = `Gain : ${money(game.payout)} (×${game.mult}) — bénéfice **+${(game.payout - game.bet).toLocaleString('fr-FR')}** ${config.currencySymbol}`;
  e.setDescription(ligne);
  return e;
}

export function blackjackComponents(game) {
  if (game.status === 'done') return [];
  const canDouble = game.player.length === 2;
  return [
    new ActionRowBuilder().addComponents(
      btn('bj:hit', 'Tirer', ButtonStyle.Primary, '🃏'),
      btn('bj:stand', 'Rester', ButtonStyle.Secondary, '✋'),
      btn('bj:double', 'Doubler', ButtonStyle.Danger, '💰').setDisabled(!canDouble)
    ),
  ];
}

// ---------------- ROULETTE ----------------

export function rouletteMenu() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🎡 Roulette')
        .setDescription(
          'Lance une table : tout le monde peut venir miser, puis on fait tourner la roue.\n' +
            'Roue européenne (0 à 36).'
        )
        .setColor(0xe74c3c),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        btn('roul:menu:new', 'Nouvelle table', ButtonStyle.Success, '🎡'),
        btn('roul:menu:odds', 'Cotes', ButtonStyle.Secondary, '📊')
      ),
    ],
  };
}

export function rouletteOddsEmbed() {
  const lignes = ROULETTE_INFO.cotes.map(([k, v]) => `**${k}** — ${v}`).join('\n');
  return new EmbedBuilder()
    .setTitle('🎡 Roulette — cotes')
    .setDescription(
      `${ROULETTE_INFO.cases} cases (0 à 36), le 0 est vert → avantage maison **${ROULETTE_INFO.edge}%**.\n\n${lignes}` +
        '\n\nPour miser : type + montant (ex. `rouge 100`), et pour un numéro plein : `plein 17 50`.'
    )
    .setColor(0xe74c3c);
}

export function rouletteLobbyEmbed(lobby) {
  const lignes = lobby.bets.map((b) => {
    const def = BET_TYPES[b.type];
    const nom = def.needsNumber ? `${def.label} ${b.number}` : def.label;
    return `<@${b.userId}> — ${money(b.amount)} sur **${nom}**`;
  });
  return new EmbedBuilder()
    .setTitle('🎡 Table de roulette ouverte')
    .setDescription(
      (lignes.join('\n') || '_Aucune mise pour l\'instant._') +
        '\n\nClique sur **Miser** pour placer un pari. Le créateur lance la roue quand tout le monde a misé.'
    )
    .setColor(lobby.open ? 0xe74c3c : 0x95a5a6);
}

export function rouletteComponents(open) {
  if (!open) return [];
  return [
    new ActionRowBuilder().addComponents(
      btn('roul:bet', 'Miser', ButtonStyle.Primary, '💰'),
      btn('roul:spin', 'Lancer la roue', ButtonStyle.Success, '🎡')
    ),
  ];
}

export function rouletteResultEmbed(lobby, result, payouts) {
  const couleur = { rouge: 0xe74c3c, noir: 0x2c3e50, vert: 0x2ecc71 }[colorOf(result)];
  const lignes = payouts.map((p) => {
    if (p.total > 0) return `✅ <@${p.userId}> gagne ${money(p.total)} (mise ${p.amount})`;
    return `❌ <@${p.userId}> perd ${money(p.amount)}`;
  });
  return new EmbedBuilder()
    .setTitle(`🎡 La bille tombe sur **${result} ${colorOf(result)}**`)
    .setDescription(lignes.join('\n') || '_Aucune mise._')
    .setColor(couleur);
}

// ---------------- COURSE DE CHEVAUX ----------------

export function horseMenu() {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('🐎 Course de chevaux')
        .setDescription(
          'Lance une course de 4 chevaux. Tout le monde peut parier sur son favori, ' +
            'puis la course se joue.\nGain = mise × cote du cheval.'
        )
        .setColor(0xf39c12),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        btn('horse:menu:new', 'Nouvelle course', ButtonStyle.Success, '🐎'),
        btn('horse:menu:odds', 'Comment ça marche', ButtonStyle.Secondary, '📊')
      ),
    ],
  };
}

export function horseOddsEmbed() {
  return new EmbedBuilder()
    .setTitle('🐎 Course — fonctionnement')
    .setDescription(
      '4 chevaux, chacun avec une **cote** affichée au départ. Plus la cote est haute, ' +
        'moins le cheval a de chances de gagner (mais ça arrive !).\n\n' +
        'Gain = mise × cote. Léger avantage maison intégré aux cotes.\n' +
        'Pour parier : numéro du cheval (1-4) + montant (ex. `2 100`).'
    )
    .setColor(0xf39c12);
}

export function horseLobbyEmbed(lobby) {
  const chevaux = lobby.race.horses
    .map((h, i) => `**${i + 1}. ${h.nom}** — cote ${h.cote.toFixed(1)}`)
    .join('\n');
  const mises = lobby.bets
    .map((b) => `<@${b.userId}> — ${money(b.amount)} sur **${lobby.race.horses[b.horse].nom}**`)
    .join('\n');
  return new EmbedBuilder()
    .setTitle('🐎 Course ouverte — les paris sont lancés !')
    .setDescription(
      chevaux +
        '\n\n' +
        (mises || '_Aucun pari pour l\'instant._') +
        '\n\nClique sur **Parier**. Le créateur lance la course quand tout le monde a parié.'
    )
    .setColor(lobby.open ? 0xf39c12 : 0x95a5a6);
}

export function horseComponents(open) {
  if (!open) return [];
  return [
    new ActionRowBuilder().addComponents(
      btn('horse:bet', 'Parier', ButtonStyle.Primary, '💰'),
      btn('horse:run', 'Lancer la course', ButtonStyle.Success, '🐎')
    ),
  ];
}

export function horseResultEmbed(lobby, winnerIndex, payouts) {
  const w = lobby.race.horses[winnerIndex];
  const classement = lobby.race.horses
    .map((h, i) => `${i === winnerIndex ? '🥇' : '▫️'} ${h.nom} (cote ${h.cote.toFixed(1)})`)
    .join('\n');
  const lignes = payouts.map((p) =>
    p.total > 0
      ? `✅ <@${p.userId}> gagne ${money(p.total)} (mise ${p.amount} × ${p.cote.toFixed(1)})`
      : `❌ <@${p.userId}> perd ${money(p.amount)}`
  );
  return new EmbedBuilder()
    .setTitle(`🐎 ${w.nom} remporte la course !`)
    .setDescription(classement + '\n\n' + (lignes.join('\n') || '_Aucun pari._'))
    .setColor(0xf39c12);
}
