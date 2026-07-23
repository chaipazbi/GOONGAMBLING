import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,

  currencyName: process.env.CURRENCY_NAME || 'GoonCoins',
  currencySymbol: process.env.CURRENCY_SYMBOL || '🪙',

  startingBalance: parseInt(process.env.STARTING_BALANCE || '1000', 10),
  dailyAmount: parseInt(process.env.DAILY_AMOUNT || '250', 10),
  dailyCooldownMs: 22 * 60 * 60 * 1000,

  // Mise posée par la maison sur CHAQUE issue à la création d'un pari.
  // C'est elle qui amorce la cagnotte et donne la cote de départ.
  betSeed: parseInt(process.env.BET_SEED || '100', 10),

  // Mise minimum autorisée pour un joueur
  minWager: parseInt(process.env.MIN_WAGER || '1', 10),

  // Fuseau horaire utilisé pour la collecte automatique du /daily
  timezone: process.env.TIMEZONE || 'Europe/Paris',

  // XP
  xpDaily: parseInt(process.env.XP_DAILY || '50', 10),
  xpDailyAuto: parseInt(process.env.XP_DAILY_AUTO || '25', 10),
  xpBetWin: parseInt(process.env.XP_BET_WIN || '25', 10),
  xpPerCoins: parseInt(process.env.XP_PER_COINS || '10', 10), // 1 XP par X pièces de gain net
};

export function money(amount) {
  return `**${Number(amount).toLocaleString('fr-FR')}** ${config.currencySymbol}`;
}
