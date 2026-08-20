// Collecte automatique du /daily, à l'heure choisie par chaque joueur.
// Le réglage et le solde sont propres à chaque serveur.
import { config, money } from './config.js';
import { getData, save } from './store.js';
import { claimDaily } from './economy.js';
import { localeNow } from './time.js';

async function tick(client) {
  const { date, time } = localeNow();

  for (const [guildId, g] of Object.entries(getData().guilds)) {
    for (const [userId, u] of Object.entries(g.users)) {
      try {
        if (!u.autoDaily) continue;
        if (u.lastAutoDate === date) continue;   // auto déjà passé aujourd'hui
        if (time < u.autoDaily) continue;         // pas encore l'heure

        // On marque tout de suite : évite de réessayer en boucle et gère le
        // rattrapage si le bot était éteint à l'heure prévue.
        u.lastAutoDate = date;
        save();

        // Même date que le tick : le daily du jour est donné une seule fois,
        // que ce soit par l'auto ou par le /daily manuel.
        const res = claimDaily(guildId, userId, { xp: config.xpDailyAuto, amount: config.dailyAmountAuto, date });
        if (!res.ok) continue; // déjà récupéré manuellement aujourd'hui

        const nomServeur = client.guilds.cache.get(guildId)?.name ?? 'ton serveur';
        let texte =
          `🎁 Collecte automatique sur **${nomServeur}** : tu reçois ${money(res.amount)} ` +
          `et **+${config.xpDailyAuto} XP** !\nNouveau solde : ${money(res.balance)}`;
        if (res.xp?.levelUp) texte += `\n🎉 Niveau **${res.xp.level}** atteint !`;
        texte += `\n_(le \`/daily\` manuel rapporte ${config.xpDaily} XP)_`;

        const user = await client.users.fetch(userId);
        await user.send(texte);
      } catch (err) {
        // MP fermés ou autre souci : la monnaie est déjà créditée, on continue.
        console.error(`Collecte auto (${userId}) :`, err.message);
      }
    }
  }
}

export function startScheduler(client) {
  // Log de diagnostic : si le fuseau posait problème, ça se verrait ici.
  const now = localeNow();
  console.log(`   Collecte auto active — il est ${now.time} le ${now.date} (${config.timezone})`);

  tick(client).catch((e) => console.error('Scheduler:', e.message));
  setInterval(() => tick(client).catch((e) => console.error('Scheduler:', e.message)), 60_000);
}
