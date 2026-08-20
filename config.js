import 'dotenv/config';

const dailyAmount = parseInt(process.env.DAILY_AMOUNT || '250', 10);

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,

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

// Table de récompense commune à toutes les caisses (probabilités, somme = 1).
// mult = multiplicateur du PRIX de la caisse. 'upgrade' = caisse du rang au-dessus.
// Gradient : petites récompenses fréquentes, grosses rares. Rien ≈ pièces.
export const CRATE_REWARDS = [
  { kind: 'nothing',             p: 0.20 }, // rien (vraie mauvaise pioche)
  { kind: 'coins',   mult: 0.75, p: 0.16 },
  { kind: 'coins',   mult: 0.90, p: 0.15 },
  { kind: 'coins',   mult: 1.00, p: 0.14 }, // remboursement (prix rendu)
  { kind: 'coins',   mult: 1.25, p: 0.13 }, // +25 %
  { kind: 'coins',   mult: 1.50, p: 0.08 }, // +50 %
  { kind: 'xp',      xp: 10,     p: 0.06 }, // petit gain d'XP
  { kind: 'upgrade',             p: 0.05 }, // caisse supérieure
  { kind: 'xp',      xp: 80,     p: 0.03 }, // gros gain d'XP (rare)
]

// Caisse mythique : pas de rang supérieur → le slot 'upgrade' devient des pièces à +75 %.
export const MYTHIC_TOP = { kind: 'coins', mult: 1.75 };

// Nombre de caisses proposées (et achetables) par jour et par joueur.
export const SHOP_SLOTS = 3;
