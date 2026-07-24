// À lancer UNE FOIS après être passé en commandes globales.
// Supprime les commandes enregistrées sur ton serveur, sinon elles
// apparaissent en double (une locale + une globale).
//
//   node clear-guild-commands.js
//
// Utilise GUILD_ID, ou MAIN_GUILD_ID si GUILD_ID a déjà été vidé.
import { REST, Routes } from 'discord.js';
import { config } from './config.js';

const guildId = config.guildId || process.env.MAIN_GUILD_ID;

if (!guildId) {
  console.error('❌ Aucun serveur ciblé : renseigne GUILD_ID ou MAIN_GUILD_ID dans .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.token);

try {
  await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: [] });
  console.log(`✅ Commandes locales du serveur ${guildId} supprimées.`);
  console.log('   Seules les commandes globales restent (propagation jusqu\'à 1h).');
} catch (err) {
  console.error('❌ Échec :', err);
  process.exit(1);
}
