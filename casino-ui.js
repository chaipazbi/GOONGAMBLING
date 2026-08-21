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
          '**Table privée** : joue contre le croupier (le bot). Victoire payée ' +
            `**× ${BJ_MIN_MULT.toFixed(2)}–${BJ_MAX_MULT.toFixed(2)}** au hasard, égalité = mise rendue.\n` +
            '**Table publique (JcJ)** : plusieurs joueurs, même mise, le plus proche ' +
            'de 21 rafle la cagnotte.'
        )
        .setColor(0x2ecc71),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        btn('bj:menu:private', 'Table privée', ButtonStyle.Success, '🃏'),
        btn('bj:menu:public', 'Table publique (JcJ)', ButtonStyle.Primary, '👥'),
        btn('bj:menu:rules', 'Règles', ButtonStyle.Secondary, '📖'),
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
        btn('roul:menu:rules', 'Règles', ButtonStyle.Secondary, '📖'),
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
        btn('horse:menu:rules', 'Règles', ButtonStyle.Secondary, '📖'),
        btn('horse:menu:odds', 'Cotes', ButtonStyle.Secondary, '📊')
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
        'Gain = mise × cote. Cotes légèrement favorables aux joueurs.\n' +
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

// ---------------- RÈGLES ----------------

export function blackjackRulesEmbed() {
  return new EmbedBuilder()
    .setTitle('🃏 Blackjack — règles')
    .setDescription(
      [
        '**But :** avoir une main plus proche de 21 que le croupier, sans dépasser.',
        '',
        '**Valeur des cartes :** 2 à 10 = leur chiffre · Valet/Dame/Roi = 10 · As = 1 ou 11 (au mieux).',
        '',
        '**Déroulé :**',
        '1. Tu mises, puis tu reçois 2 cartes. Le croupier en montre une seule.',
        '2. **Tirer** : une carte de plus · **Rester** : garder ta main · **Doubler** : doubler la mise, une seule carte, puis stop.',
        '3. Si tu dépasses 21, tu sautes (perdu direct).',
        '4. Quand tu restes, le croupier tire jusqu\'à atteindre 17.',
        '',
        `**Issues :** tu gagnes si ta main bat celle du croupier (ou s\'il saute). Victoire = mise × un multiplicateur aléatoire **${BJ_MIN_MULT.toFixed(2)}–${BJ_MAX_MULT.toFixed(2)}**. Égalité = mise rendue. Défaite = mise perdue.`,
      ].join('\n')
    )
    .setColor(0x2ecc71);
}

export function rouletteRulesEmbed() {
  return new EmbedBuilder()
    .setTitle('🎡 Roulette — règles')
    .setDescription(
      [
        '**But :** deviner où la bille va s\'arrêter sur une roue de 0 à 36.',
        '',
        '**Comment jouer :**',
        '1. Quelqu\'un lance une table, tout le monde peut venir miser.',
        '2. Clique **Miser**, choisis un type de pari et un montant.',
        '3. Le créateur lance la roue : la bille tombe sur un numéro, les gagnants sont payés.',
        '',
        '**Types de paris et gains :**',
        '▫️ **Rouge / Noir / Pair / Impair / Manque (1-18) / Passe (19-36)** → gain ×2',
        '▫️ **Douzaine (1-12, 13-24, 25-36) / Colonne** → gain ×3',
        '▫️ **Numéro plein** (un numéro exact, ex. `plein 17`) → gain ×36',
        '',
        '_Le 0 est vert : sur rouge/noir/pair/impair, le 0 fait perdre — c\'est l\'avantage maison._',
      ].join('\n')
    )
    .setColor(0xe74c3c);
}

export function horseRulesEmbed() {
  return new EmbedBuilder()
    .setTitle('🐎 Course de chevaux — règles')
    .setDescription(
      [
        '**But :** parier sur le cheval qui va gagner la course.',
        '',
        '**Comment jouer :**',
        '1. Quelqu\'un lance une course : 4 chevaux apparaissent, chacun avec sa **cote**.',
        '2. Clique **Parier**, choisis le numéro du cheval (1 à 4) et ta mise.',
        '3. Le créateur lance la course, un cheval gagne.',
        '',
        '**La cote = ton gain.** Gain = mise × cote. Ex. : 100 misés sur une cote 3.0 → 300 si tu gagnes (sinon mise perdue).',
        '',
        '**Cote haute** = gros gain mais moins de chances · **cote basse** = petit gain plus sûr. À toi de doser le risque !',
      ].join('\n')
    )
    .setColor(0xf39c12);
}

// ---------------- BLACKJACK : TABLE PUBLIQUE (JcJ) ----------------

export function bjTableLobbyEmbed(table) {
  const joueurs = table.players.map((p) => {
    if (table.phase === 'lobby') return `• <@${p.userId}>`;
    if (table.phase === 'playing') {
      if (p.status === 'done') return handValue(p.hand) > 21 ? `💥 <@${p.userId}> (a joué)` : `✅ <@${p.userId}> (a joué)`;
      return `🎴 <@${p.userId}> — doit jouer`;
    }
    return `<@${p.userId}>`;
  });

  const e = new EmbedBuilder().setColor(0x2ecc71);
  if (table.phase === 'lobby') {
    e.setTitle('👥 Table de blackjack (Joueur contre Joueur)')
      .setDescription(
        `Mise d'entrée : ${money(table.ante)} · Cagnotte : ${money(table.ante * table.players.length)}\n\n` +
          `**Joueurs (${table.players.length}) :**\n${joueurs.join('\n')}\n\n` +
          'Cliquez **Rejoindre** pour entrer. Le créateur distribue quand tout le monde est prêt (2 joueurs min).'
      );
  } else {
    e.setTitle('👥 Blackjack JcJ — partie en cours')
      .setDescription(
        `Cagnotte : ${money(table.ante * table.players.length)}\n\n` +
          `${joueurs.join('\n')}\n\n` +
          'Chaque joueur clique **Jouer ma main**. Le plus proche de 21 sans dépasser gagne.'
      );
  }
  return e;
}

export function bjTableComponents(table) {
  if (table.phase === 'lobby') {
    return [
      new ActionRowBuilder().addComponents(
        btn('bjtable:join', 'Rejoindre', ButtonStyle.Success, '➕'),
        btn('bjtable:deal', 'Distribuer', ButtonStyle.Primary, '🃏')
      ),
    ];
  }
  if (table.phase === 'playing') {
    return [
      new ActionRowBuilder().addComponents(
        btn('bjtable:play', 'Jouer ma main', ButtonStyle.Primary, '🎴'),
        btn('bjtable:resolve', 'Terminer la partie', ButtonStyle.Danger, '🏁')
      ),
    ];
  }
  return [];
}

export function bjHandEmbed(hand) {
  const v = handValue(hand);
  return new EmbedBuilder()
    .setTitle('🎴 Ta main')
    .setDescription(`${handLabel(hand)}  (**${v}**)` + (v > 21 ? '\n💥 Tu as dépassé 21 !' : ''))
    .setColor(v > 21 ? 0xe74c3c : 0x3498db);
}

export function bjHandComponents(tableId, done) {
  if (done) return [];
  return [
    new ActionRowBuilder().addComponents(
      btn(`bjhand:hit:${tableId}`, 'Tirer', ButtonStyle.Primary, '🃏'),
      btn(`bjhand:stand:${tableId}`, 'Rester', ButtonStyle.Secondary, '✋')
    ),
  ];
}

export function bjTableResultEmbed(table, result) {
  const pot = table.ante * table.players.length;
  const lignes = table.players.map((p) => {
    const v = handValue(p.hand);
    const bust = v > 21;
    const gagnant = result.winners.includes(p.userId);
    const marque = gagnant ? '🏆' : bust ? '💥' : '▫️';
    return `${marque} <@${p.userId}> — ${handLabel(p.hand)} (**${bust ? 'sauté' : v}**)`;
  });

  let concl;
  if (result.allBust) concl = 'Tout le monde a sauté — cagnotte remboursée à chacun.';
  else if (result.winners.length === 1) concl = `<@${result.winners[0]}> remporte la cagnotte de ${money(pot)} !`;
  else concl = `Égalité à ${result.best} — cagnotte de ${money(pot)} partagée entre ` + result.winners.map((w) => `<@${w}>`).join(', ') + '.';

  return new EmbedBuilder()
    .setTitle('👥 Blackjack JcJ — résultat')
    .setDescription(lignes.join('\n') + '\n\n' + concl)
    .setColor(0xf1c40f);
}
