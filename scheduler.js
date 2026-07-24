// Collecte automatique du /daily, à l'heure choisie par chaque joueur.
// Le réglage et le solde sont propres à chaque serveur.
import { config, money } from './config.js';
import { getData, save } from './store.js';
import { claimDaily } from './economy.js';

export function localeNow() {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

async function tick(client) {
  const { date, time } = localeNow();

  for (const [guildId, g] of Object.entries(getData().guilds)) {
    for (const [userId, u] of Object.entries(g.users)) {
      if (!u.autoDaily) continue;
      if (u.lastAutoDate === date) continue;   // déjà fait aujourd'hui
      if (time < u.autoDaily) continue;        // pas encore l'heure

      // Marqué avant la collecte : si le bot était éteint à l'heure prévue,
      // il rattrape au démarrage, mais une seule fois par jour.
      u.lastAutoDate = date;
      save();

      const res = claimDaily(guildId, userId, { xp: config.xpDailyAuto });
      if (!res.ok) continue;

      try {
        const nomServeur = client.guilds.cache.get(guildId)?.name ?? 'ton serveur';
        let texte =
          `🎁 Collecte automatique sur **${nomServeur}** : tu reçois ${money(res.amount)} ` +
          `et **+${config.xpDailyAuto} XP** !\nNouveau solde : ${money(res.balance)}`;
        if (res.xp?.levelUp) texte += `\n🎉 Niveau **${res.xp.level}** atteint !`;
        texte += `\n_(le \`/daily\` manuel rapporte ${config.xpDaily} XP)_`;
        const user = await client.users.fetch(userId);
        await user.send(texte);
      } catch {
        // MP fermés : la monnaie est créditée quand même
      }
    }
  }
}

export function startScheduler(client) {
  tick(client).catch((e) => console.error('Scheduler:', e.message));
  setInterval(() => tick(client).catch((e) => console.error('Scheduler:', e.message)), 60_000);
  console.log(`   Collecte auto active (fuseau : ${config.timezone})`);
}
