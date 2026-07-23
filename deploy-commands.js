import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commands } from './commands.js';

const rest = new REST({ version: '10' }).setToken(config.token);

try {
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log(`✅ ${commands.length} commandes déployées sur le serveur ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`✅ ${commands.length} commandes déployées globalement (propagation jusqu'à 1h).`);
  }
} catch (err) {
  console.error('❌ Échec du déploiement des commandes :', err);
  process.exit(1);
}
