import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

const channel = (option, name, description) => option.setName(name).setDescription(description)
  .addChannelTypes(ChannelType.GuildText).setRequired(true);
export const protectionCommands = [
  new SlashCommandBuilder().setName('protection').setDescription('Salon piège et protection contre les images de scam')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('logs').setDescription('Définir le salon des preuves et sanctions')
      .addChannelOption((o) => channel(o, 'salon', 'Salon privé réservé aux modérateurs')))
    .addSubcommand((s) => s.setName('piege').setDescription('Activer ou désactiver le salon piège')
      .addBooleanOption((o) => o.setName('actif').setDescription('Activer le timeout de 28 jours').setRequired(true))
      .addChannelOption((o) => o.setName('salon').setDescription('Salon piège').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('images').setDescription('Choisir le mode de détection des images')
      .addStringOption((o) => o.setName('mode').setDescription('Action si une image de référence est reconnue').setRequired(true)
        .addChoices({name:'Suppression + timeout 28 jours',value:'auto'}, {name:'Alerte uniquement',value:'alert'}, {name:'Désactivé',value:'off'})))
    .addSubcommand((s) => s.setName('ajouter-image').setDescription('Ajouter une image de scam de référence')
      .addAttachmentOption((o) => o.setName('image').setDescription('Fichier image, 8 Mio maximum').setRequired(true)))
    .addSubcommand((s) => s.setName('retirer-image').setDescription('Retirer une référence ajoutée sur ce serveur')
      .addStringOption((o) => o.setName('id').setDescription('Identifiant indiqué par la liste').setRequired(true)))
    .addSubcommand((s) => s.setName('liste-images').setDescription('Lister les références de scam'))
    .addSubcommand((s) => s.setName('exemption').setDescription('Exempter ou rétablir un rôle dans les protections')
      .addRoleOption((o) => o.setName('role').setDescription('Rôle concerné').setRequired(true))
      .addBooleanOption((o) => o.setName('exempte').setDescription('Exempter ce rôle').setRequired(true)))
    .addSubcommand((s) => s.setName('statut').setDescription('Voir les réglages de protection'))
    .addSubcommand((s) => s.setName('demute').setDescription('Lever un timeout, sans renouvellement automatique')
      .addUserOption((o) => o.setName('membre').setDescription('Membre à démuter').setRequired(true))),
  new SlashCommandBuilder().setName('logs').setDescription('Configurer les logs du serveur')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('configurer').setDescription('Activer les logs généraux dans un salon')
      .addChannelOption((o) => channel(o, 'salon', 'Salon privé des logs du serveur')))
    .addSubcommand((s) => s.setName('desactiver').setDescription('Arrêter les logs généraux'))
    .addSubcommand((s) => s.setName('statut').setDescription('Voir le salon des logs')),
];
