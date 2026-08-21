// Définition de toutes les commandes slash.
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const MAX_ISSUES = 20;

function buildCreer(s) {
  s.setName('creer')
    .setDescription(`Crée un pari (jusqu'à ${MAX_ISSUES} issues)`)
    .addStringOption((o) => o.setName('titre').setDescription('Sujet du pari').setRequired(true))
    .addStringOption((o) => o.setName('issue_1').setDescription('Issue n°1').setRequired(true))
    .addStringOption((o) => o.setName('issue_2').setDescription('Issue n°2').setRequired(true));
  for (let i = 3; i <= MAX_ISSUES; i++) {
    s.addStringOption((o) => o.setName(`issue_${i}`).setDescription(`Issue n°${i}`).setRequired(false));
  }
  return s;
}

export const commands = [
  new SlashCommandBuilder()
    .setName('solde')
    .setDescription("Affiche ton solde (ou celui d'un membre)")
    .addUserOption((o) => o.setName('membre').setDescription('Le membre à consulter')),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Récupère ta récompense quotidienne')
    .addStringOption((o) =>
      o
        .setName('auto')
        .setDescription("Programme la collecte auto : une heure (ex 09:00) ou 'off' pour désactiver")
    ),

  new SlashCommandBuilder()
    .setName('donner')
    .setDescription('Donne de la monnaie à un membre')
    .addUserOption((o) => o.setName('membre').setDescription('Le destinataire').setRequired(true))
    .addIntegerOption((o) =>
      o.setName('montant').setDescription('Montant à donner').setMinValue(1).setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Classement des joueurs')
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('Classer par pièces ou par niveau')
        .addChoices(
          { name: 'Pièces', value: 'coins' },
          { name: 'Niveau', value: 'xp' }
        )
    ),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription("Profil : niveau, XP et statistiques de paris")
    .addUserOption((o) => o.setName('membre').setDescription('Le membre à consulter')),

  new SlashCommandBuilder()
    .setName('eco')
    .setDescription('Gestion de la monnaie (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Ajoute de la monnaie à un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription('Montant').setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retire de la monnaie à un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription('Montant').setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('definir')
        .setDescription("Fixe le solde d'un membre")
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription('Nouveau solde').setMinValue(0).setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('xp')
    .setDescription("Gestion de l'expérience (admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('ajouter')
        .setDescription('Ajoute de l\'XP à un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription("Quantité d'XP").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retire de l\'XP à un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription("Quantité d'XP").setMinValue(1).setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('definir')
        .setDescription("Fixe l'XP totale d'un membre")
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((o) => o.setName('montant').setDescription('Nouvelle XP totale').setMinValue(0).setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName('boutique')
    .setDescription('Affiche la boutique du jour (caisses à acheter)'),

  new SlashCommandBuilder()
    .setName('inventaire')
    .setDescription('Ouvre ton inventaire de caisses')
    .addUserOption((o) => o.setName('membre').setDescription("Voir l'inventaire d'un membre")),

  new SlashCommandBuilder()
    .setName('caisses')
    .setDescription('Affiche les probabilités de chaque caisse'),

  new SlashCommandBuilder()
    .setName('caisse')
    .setDescription('Gestion des caisses (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('donner')
        .setDescription('Donne des caisses à un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('rarete')
            .setDescription('Rareté de la caisse')
            .setRequired(true)
            .addChoices(
              { name: 'Commune', value: 'commun' },
              { name: 'Rare', value: 'rare' },
              { name: 'Épique', value: 'epic' },
              { name: 'Légendaire', value: 'legendaire' },
              { name: 'Mythique', value: 'mythique' }
            )
        )
        .addIntegerOption((o) => o.setName('nombre').setDescription('Combien').setMinValue(1).setMaxValue(1000))
    )
    .addSubcommand((s) =>
      s
        .setName('retirer')
        .setDescription('Retire des caisses à un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('rarete')
            .setDescription('Rareté de la caisse')
            .setRequired(true)
            .addChoices(
              { name: 'Commune', value: 'commun' },
              { name: 'Rare', value: 'rare' },
              { name: 'Épique', value: 'epic' },
              { name: 'Légendaire', value: 'legendaire' },
              { name: 'Mythique', value: 'mythique' }
            )
        )
        .addIntegerOption((o) => o.setName('nombre').setDescription('Combien').setMinValue(1).setMaxValue(1000))
    ),

  new SlashCommandBuilder()
    .setName('refresh-boutique')
    .setDescription('Force le renouvellement de la boutique (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) =>
      o.setName('membre').setDescription("Cibler un seul membre (sinon tout le serveur)")
    ),

  new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Joue au blackjack contre le croupier'),

  new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Lance une table de roulette'),

  new SlashCommandBuilder()
    .setName('course-de-cheval')
    .setDescription('Lance une course de chevaux'),

  new SlashCommandBuilder()
    .setName('pari')
    .setDescription('Système de paris')
    .addSubcommand(buildCreer)
    .addSubcommand((s) => s.setName('liste').setDescription('Liste les paris en cours')),
].map((c) => c.toJSON());
