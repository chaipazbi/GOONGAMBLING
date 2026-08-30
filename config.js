import 'dotenv/config';

const dailyAmount = parseInt(process.env.DAILY_AMOUNT || '250', 10);

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  ownerId: process.env.OWNER_ID || null,

  currencyName: process.env.CURRENCY_NAME || 'GoonCoins',
  currencySymbol: process.env.CURRENCY_SYMBOL || '🪙',

  startingBalance: parseInt(process.env.STARTING_BALANCE || '1000', 10),
  dailyAmount,
  // Le daily auto rapporte deux fois moins de pièces que le manuel.
  dailyAmountAuto: parseInt(process.env.DAILY_AMOUNT_AUTO || '', 10) || Math.floor(dailyAmount / 2),
  dailyCooldownMs: 22 * 60 * 60 * 1000,

  betSeed: parseInt(process.env.BET_SEED || '100', 10),
  minWager: parseInt(process.env.MIN_WAGER || '1', 10),

  timezone: process.env.TIMEZONE || 'Europe/Paris',

  maxMiseCasino: parseInt(process.env.MAX_MISE_CASINO || '10000', 10),
  msgXpMin: parseInt(process.env.MSG_XP_MIN || '2', 10),
  msgXpMax: parseInt(process.env.MSG_XP_MAX || '30', 10),
  msgXpCharDiv: parseInt(process.env.MSG_XP_CHARDIV || '15', 10),
  msgXpCooldown: parseInt(process.env.MSG_XP_COOLDOWN || '60', 10),
  xpCasinoMin: parseFloat(process.env.XP_CASINO_MIN || '0.01'),
  xpCasinoMax: parseFloat(process.env.XP_CASINO_MAX || '0.02'),
  xpDaily: parseInt(process.env.XP_DAILY || '50', 10),
  xpDailyAuto: parseInt(process.env.XP_DAILY_AUTO || '25', 10),
  xpBetWin: parseInt(process.env.XP_BET_WIN || '25', 10),
  xpPerCoins: parseInt(process.env.XP_PER_COINS || '10', 10),
};

export function money(amount) {
  return `**${Number(amount).toLocaleString('fr-FR')}** ${config.currencySymbol}`;
}

// ===================== BOUTIQUE / CAISSES =====================

// Caisses, de la plus commune à la plus rare.
// L'ordre définit la "caisse supérieure" (rang au-dessus).
// spawn = poids d'apparition en boutique (plus le rang est haut, plus c'est rare).
export const CRATES = [
  { id: 'commun',     nom: 'Commune',    prix: 750,  spawn: 45, emoji: '⚪', couleur: 0x95a5a6 },
  { id: 'rare',       nom: 'Rare',       prix: 1250, spawn: 27, emoji: '🔵', couleur: 0x3498db },
  { id: 'epic',       nom: 'Épique',     prix: 2000, spawn: 15, emoji: '🟣', couleur: 0x9b59b6 },
  { id: 'legendaire', nom: 'Légendaire', prix: 2500, spawn: 9,  emoji: '🟡', couleur: 0xf1c40f },
  { id: 'mythique',   nom: 'Mythique',   prix: 3000, spawn: 4,  emoji: '🔴', couleur: 0xe74c3c },
];

// Probabilité de "rien" par rareté (dégressive ; la mythique n'en a pas).
export const CRATE_RIEN = {
  commun: 0.20,
  rare: 0.17,
  epic: 0.14,
  legendaire: 0.11,
  mythique: 0.0,
};

// Récompenses hors "rien", avec poids relatifs (w). Elles se répartissent la
// probabilité restante (1 - rien) : moins de "rien" = plus de récompenses.
// mult = multiplicateur du PRIX de la caisse. 'upgrade' = caisse du rang au-dessus.
export const CRATE_REWARDS = [
  { kind: 'coins',   mult: 0.85, w: 16 },
  { kind: 'coins',   mult: 1.00, w: 15 }, // remboursement
  { kind: 'coins',   mult: 1.20, w: 14 },
  { kind: 'coins',   mult: 1.40, w: 10 },
  { kind: 'coins',   mult: 1.70, w: 6 },  // gros gain
  { kind: 'upgrade',             w: 5 },  // caisse supérieure
  { kind: 'xp',      xp: 10,     w: 6 },
  { kind: 'xp',      xp: 80,     w: 3 },
]

// Caisse mythique : pas de rang supérieur → le slot 'upgrade' devient des pièces à +75 %.
export const MYTHIC_TOP = { kind: 'coins', mult: 1.75 };

// Nombre de caisses proposées (et achetables) par jour et par joueur.
export const SHOP_SLOTS = 3;
