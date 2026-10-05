import { Events, PermissionFlagsBits, AuditLogEvent } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { getSettings, save } from './store.js';
import { builtinImages, fingerprint, matchFingerprint, imageAttachments, downloadMedia, MAX_IMAGE_BYTES } from './scam-images.js';
import { exemption, enforceProtection, messageSnapshot, voiceChanges } from './protection-core.js';

const noMentions = { parse: [] };
const truncate = (v, max = 1000) => String(v ?? 'Indisponible').slice(0, max) || '(vide)';
const actor = (u) => u ? `${u.tag || u.username || 'Utilisateur'} — ${u.id}` : 'Indisponible';
const settings = (id) => getSettings(id);

export function createProtection(client) {
  const snapshots = new Map(); const suppressed = new Map();
  let scans = Promise.resolve(); let scanCount = 0;
  let logs = Promise.resolve(); let logCount = 0;
  function remember(m) {
    if (!m.guildId || isLogChannel(m.guildId, m.channelId) || m.author?.id === client.user?.id) return;
    if (m.partial) return;
    snapshots.delete(m.id); snapshots.set(m.id, { ...messageSnapshot(m), cachedAt: Date.now() });
    while (snapshots.size > 1000) snapshots.delete(snapshots.keys().next().value);
  }
  function cached(id) {
    const s = snapshots.get(id);
    return s && Date.now() - s.cachedAt < 24 * 60 * 60 * 1000 ? s : null;
  }
  function isLogChannel(guildId, channelId) {
    const st = settings(guildId);
    return channelId === st.protection.logChannelId || channelId === st.serverLogs.channelId;
  }
  async function sendLog(guildId, title, fields, { protection = false, files = [] } = {}) {
    const st = settings(guildId);
    const channelId = protection ? st.protection.logChannelId : st.serverLogs.enabled && st.serverLogs.channelId;
    if (!channelId) return;
    if (logCount >= 200) { console.error('Logs serveur : file pleine, événement non envoyé.', guildId, title); return; }
    logCount++;
    const work = logs.then(async () => {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || channel.guildId !== guildId) throw new Error('Salon de logs indisponible.');
      await channel.send({ embeds: [{ title: truncate(title, 200), color: protection ? 0xe74c3c : 0x5865f2,
        timestamp: new Date().toISOString(), fields: fields.slice(0, 7).map(([name, value]) => ({ name, value: truncate(value, 800) })) }],
        files: files.slice(0, 10), allowedMentions: noMentions });
    }).catch((err) => console.error('Logs serveur :', guildId, title, err.message));
    logs = work.finally(() => { logCount--; });
    return logs;
  }
  const general = (guildId, title, fields, options) => sendLog(guildId, title, fields, options);
  const snapshotFields = (s) => [['Utilisateur / ID', `${s.authorName} — ${s.authorId || 'inconnu'}`],
    ['Salon / message', `<#${s.channelId}> — ${s.id}`], ['Contenu', s.content === null ? 'Contenu non reçu par le bot.' : s.content || '(sans texte)'],
    ['Pièces jointes', s.attachments.map((a) => `${a.name} : ${a.url}`).join('\n') || 'Aucune'],
    ['Aperçus / stickers', [...(s.embeds || []).map((e) => e.title || e.description || e.image || e.url || 'Aperçu'),
      ...(s.stickers || []).map((e) => `${e.name} (${e.id})`)].join('\n') || 'Aucun']];
  function snapshotFile(s) {
    const { _files, cachedAt, ...copy } = s;
    return { attachment: Buffer.from(JSON.stringify(copy, null, 2)), name: `message-${s.id}.json` };
  }
  async function capture(s) {
    s._files ??= [];
    let bytes = s._files.reduce((n, f) => n + f.attachment.length, 0);
    let failed = false;
    for (const a of s.attachments.slice(0, 3)) {
      if (s._files.some((f) => f.source === a.url)) continue;
      if (a.size > MAX_IMAGE_BYTES || bytes + (a.size || MAX_IMAGE_BYTES) > MAX_IMAGE_BYTES) { failed = true; continue; }
      try {
        const buffer = await downloadMedia(a.url, { maxBytes: MAX_IMAGE_BYTES - bytes }); bytes += buffer.length;
        const name = String(a.name).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 90);
        s._files.push({ attachment: buffer, name: `${s._files.length}-${name}`, source: a.url });
      } catch { failed = true; }
    }
    if (s.attachments.length > 3) failed = true;
    if (failed) throw new Error('Copie incomplète.');
  }
  async function evidence(s, result) {
    await sendLog(s.guildId, result.mode === 'alert' ? 'Image de scam reconnue — alerte' : 'Protection — message bloqué',
      [['Raison', result.reason], ...snapshotFields(s), ['Résultat', result.mode === 'alert' ? 'Aucune sanction (mode alerte).'
        : `Timeout 28 jours : ${result.timeout ? 'appliqué' : 'ÉCHEC'}\nMessage supprimé : ${result.deleted ? 'oui' : 'NON'}\n${result.failures.join('\n')}`]],
      { protection: true, files: [snapshotFile(s), ...(s._files || []).map(({ attachment, name }) => ({ attachment, name }))] });
  }
  async function apply(message, reason, snapshot, mode = 'auto') {
    return enforceProtection({ message, reason, snapshot, mode, log: evidence, capture,
      beforeDelete: (id) => { suppressed.set(id, Date.now()); while (suppressed.size > 1000) suppressed.delete(suppressed.keys().next().value); },
      deleteFailed: (id) => suppressed.delete(id) });
  }
  async function onMessage(message) {
    if (!message.guildId) return false;
    remember(message);
    if (isLogChannel(message.guildId, message.channelId)) return false;
    const st = settings(message.guildId).protection;
    if (exemption(message, st)) return false;
    if (st.trapChannelId && (st.trapChannelId === message.channelId
      || (message.channel?.isThread?.() && message.channel.parentId === st.trapChannelId))) {
      await apply(message, 'Message envoyé dans le salon piège.', messageSnapshot(message)); return true;
    }
    if (st.imageMode === 'off') return false;
    const attachments = imageAttachments(message);
    if (!attachments.length) return false;
    if (scanCount >= 30) {
      await sendLog(message.guildId, 'Analyse image non effectuée', [['Message', message.id], ['Raison', 'File d’analyse pleine. Aucune sanction.']], { protection: true });
      return false;
    }
    scanCount++;
    const work = scans.then(async () => {
      // Relire la configuration après attente, pour respecter une désactivation.
      const current = settings(message.guildId).protection;
      if (current.imageMode === 'off' || exemption(message, current)) return false;
      for (const a of attachments) {
        try {
          if (a.size > MAX_IMAGE_BYTES) throw new Error('Image supérieure à 8 Mio.');
          const buffer = await downloadMedia(a.url);
          const match = matchFingerprint(await fingerprint(buffer), [...builtinImages, ...current.images]);
          if (!match) continue;
          if (!['auto', 'alert'].includes(current.imageMode) || exemption(message, current)) return false;
          const snapshot = messageSnapshot(message);
          snapshot._files = [{ attachment: buffer, name: 'image-reconnue' + (/\.(png|jpe?g|webp|gif|avif)$/i.exec(a.name || '')?.[0] || '.bin'), source: a.url }];
          await apply(message, `Image de scam reconnue : ${match.reference.name} (${match.reference.id}), ${match.exact ? 'copie exacte' : 'forte similarité visuelle'}.`, snapshot, current.imageMode);
          return current.imageMode === 'auto';
        } catch (err) {
          await sendLog(message.guildId, 'Analyse image impossible', [['Utilisateur', actor(message.author)], ['Message', message.id],
            ['Raison', err.message], ['Conséquence', 'Aucune sanction sur la base de cette image.']], { protection: true });
        }
      }
      return false;
    });
    scans = work.catch((err) => console.error('Protection image :', err.message));
    try { return await work; } finally { scanCount--; }
  }

  async function validateChannel(channel, guild) {
    if (!channel || channel.guildId !== guild.id || !channel.isTextBased()) throw new Error('Choisis un salon texte de ce serveur.');
    const me = guild.members.me || await guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles])) throw new Error('Le bot doit voir le salon et pouvoir envoyer des messages, liens intégrés et fichiers.');
  }
  async function validateModeration(guild, channel) {
    const me = guild.members.me || await guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) throw new Error('Permission Modérer les membres requise pour le bot.');
    if (channel && !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages])) {
      throw new Error('Le bot doit voir le salon piège et pouvoir y supprimer les messages.');
    }
  }
  async function command(i) {
    if (!i.guildId || !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: 'Permission Gérer le serveur requise.', ephemeral: true });
    await i.deferReply({ ephemeral: true });
    const st = settings(i.guildId); const p = st.protection; const sub = i.options.getSubcommand();
    if (i.commandName === 'logs') {
      if (sub === 'configurer') {
        const ch = i.options.getChannel('salon'); await validateChannel(ch, i.guild);
        if (ch.id === p.trapChannelId) throw new Error('Le salon piège ne peut pas servir de salon de logs.');
        st.serverLogs.channelId = ch.id; st.serverLogs.enabled = true; save();
        const me = i.guild.members.me || await i.guild.members.fetchMe();
        await i.editReply(`Logs généraux activés dans ${ch}.${me.permissions.has(PermissionFlagsBits.ViewAuditLog) ? '' : '\nAjoute Voir les logs du serveur au bot pour les actions administratives.'}`);
        return general(i.guildId, 'Logs activés', [['Par', actor(i.user)]]);
      }
      if (sub === 'desactiver') { st.serverLogs.enabled = false; save(); return i.editReply('Logs généraux désactivés.'); }
      return i.editReply(`Logs : ${st.serverLogs.enabled ? 'actifs' : 'désactivés'}\nSalon : ${st.serverLogs.channelId ? `<#${st.serverLogs.channelId}>` : 'non défini'}`);
    }
    if (sub === 'logs') {
      const ch = i.options.getChannel('salon'); await validateChannel(ch, i.guild);
      if (ch.id === p.trapChannelId) throw new Error('Le salon piège ne peut pas servir de salon de logs.');
      p.logChannelId = ch.id; save(); return i.editReply(`Preuves et sanctions dans ${ch}. Réserve ce salon aux modérateurs.`);
    }
    if (sub === 'piege') {
      const active = i.options.getBoolean('actif'); const ch = i.options.getChannel('salon');
      if (!active) { p.trapChannelId = null; save(); return i.editReply('Salon piège désactivé.'); }
      if (!p.logChannelId) throw new Error('Configure /protection logs avant de sanctionner.');
      if (!ch || !ch.isTextBased() || ch.guildId !== i.guildId) throw new Error('Choisis le salon piège.');
      if (isLogChannel(i.guildId, ch.id)) throw new Error('Le salon piège doit être distinct des salons de logs.');
      await validateModeration(i.guild, ch); p.trapChannelId = ch.id; save();
      return i.editReply(`Salon piège activé : ${ch}. Tout message d’un membre non exempté entraîne suppression et timeout de 28 jours. Place le rôle du bot au-dessus des membres à modérer.`);
    }
    if (sub === 'images') {
      const mode = i.options.getString('mode');
      if (mode !== 'off') {
        if (!p.logChannelId) throw new Error('Configure /protection logs en premier.');
        if (mode === 'auto') await validateModeration(i.guild);
      }
      p.imageMode = mode; save(); return i.editReply(`Détection d’images : ${mode === 'auto' ? 'suppression et timeout 28 jours' : mode === 'alert' ? 'alerte sans sanction' : 'désactivée'}.`);
    }
    if (sub === 'ajouter-image') {
      if (p.images.length >= 100) throw new Error('Maximum 100 références supplémentaires par serveur.');
      const a = i.options.getAttachment('image');
      if (a.size > MAX_IMAGE_BYTES) throw new Error('Image limitée à 8 Mio.');
      const hash = await fingerprint(await downloadMedia(a.url));
      if ([...builtinImages, ...p.images].some((r) => r.sha256 === hash.sha256)) return i.editReply('Cette image figure déjà dans les références.');
      const reference = { ...hash, id: randomUUID(), name: truncate(a.name, 80), addedBy: i.user.id };
      p.images.push(reference); save(); return i.editReply(`Image ajoutée : ${reference.name}\nID : ${reference.id}`);
    }
    if (sub === 'retirer-image') {
      const id = i.options.getString('id'); const at = p.images.findIndex((r) => r.id === id);
      if (at < 0) return i.editReply('Référence ajoutée introuvable. Les références intégrées ne se retirent pas par cette commande.');
      p.images.splice(at, 1); save(); return i.editReply('Image de référence retirée.');
    }
    if (sub === 'liste-images') {
      const refs = [...builtinImages, ...p.images].map((r) => `${r.id} — ${r.name}`).join('\n');
      return i.editReply({ content: `${builtinImages.length} références intégrées + ${p.images.length} ajoutée(s).`,
        files: [{ attachment: Buffer.from(refs), name: 'references-scam.txt' }] });
    }
    if (sub === 'exemption') {
      const role = i.options.getRole('role'); if (role.id === i.guildId) throw new Error('Le rôle @everyone ne peut pas être exempté.');
      p.exemptRoleIds = p.exemptRoleIds.filter((id) => id !== role.id);
      if (i.options.getBoolean('exempte')) p.exemptRoleIds.push(role.id);
      save(); return i.editReply(`Exemption de ${role.name} : ${i.options.getBoolean('exempte') ? 'active' : 'retirée'}.`);
    }
    if (sub === 'demute') {
      if (!i.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) throw new Error('Permission Modérer les membres requise.');
      const user = i.options.getUser('membre'); const member = await i.guild.members.fetch(user.id);
      if (!member.moderatable) throw new Error('Le bot ne peut pas modérer ce membre.');
      await member.timeout(null, `Timeout levé par ${i.user.id}`);
      await sendLog(i.guildId, 'Timeout levé manuellement', [['Membre', actor(user)], ['Par', actor(i.user)]], { protection: true });
      return i.editReply(`Timeout de ${user.username} levé. Aucun renouvellement automatique.`);
    }
    return i.editReply(`Salon piège : ${p.trapChannelId ? `<#${p.trapChannelId}>` : 'désactivé'}\nImages : ${p.imageMode}\nLogs protection : ${p.logChannelId ? `<#${p.logChannelId}>` : 'non définis'}\nRéférences : ${builtinImages.length + p.images.length}\nRôles exemptés : ${p.exemptRoleIds.map((id) => `<@&${id}>`).join(', ') || 'aucun'}\nTimeout : 28 jours, sans renouvellement. Bots, webhooks et propriétaire exclus. Discord ne permet pas de timeout les administrateurs.`);
  }

  function listen(event, handler) {
    client.on(event, (...args) => Promise.resolve().then(() => handler(...args)).catch((e) => console.error(`Logs ${event} :`, e.message)));
  }
  listen(Events.MessageDelete, async (m) => {
    if (!m.guildId || isLogChannel(m.guildId, m.channelId) || m.author?.id === client.user?.id) return;
    const skip = suppressed.get(m.id); suppressed.delete(m.id);
    if (skip && Date.now() - skip < 60_000) { snapshots.delete(m.id); return; }
    const s = cached(m.id) || messageSnapshot(m); snapshots.delete(m.id);
    await general(m.guildId, 'Message supprimé', snapshotFields(s), { files: [snapshotFile(s)] });
  });
  listen(Events.MessageBulkDelete, async (messages, channel) => {
    if (!channel.guildId || isLogChannel(channel.guildId, channel.id)) return;
    const entries = [...messages.values()].map((m) => cached(m.id) || messageSnapshot(m));
    for (const m of messages.values()) snapshots.delete(m.id);
    await general(channel.guildId, 'Suppression groupée de messages', [['Salon', `<#${channel.id}>`], ['Nombre', entries.length],
      ['Auteur de la suppression', 'Voir le journal d’audit si Discord fournit cette action.']],
      { files: [{ attachment: Buffer.from(JSON.stringify(entries, null, 2)), name: 'messages-supprimes.json' }] });
  });
  listen(Events.MessageUpdate, async (old, updated) => {
    if (!updated.guildId || isLogChannel(updated.guildId, updated.channelId) || updated.author?.id === client.user?.id) return;
    const before = cached(old.id) || messageSnapshot(old);
    if (updated.partial) { try { updated = await updated.fetch(); } catch { return; } }
    const after = messageSnapshot(updated);
    if (before.content !== after.content || JSON.stringify(before.attachments) !== JSON.stringify(after.attachments)
      || JSON.stringify(before.embeds) !== JSON.stringify(after.embeds)) {
      await general(updated.guildId, 'Message modifié', [['Utilisateur', `${after.authorName} — ${after.authorId}`],
        ['Salon / message', `<#${after.channelId}> — ${after.id}`], ['Avant', before.content ?? 'Contenu précédent indisponible.'], ['Après', after.content]],
        { files: [{ attachment: Buffer.from(JSON.stringify({ before, after }, null, 2)), name: `modification-${after.id}.json` }] });
    }
    await onMessage(updated);
  });
  listen(Events.VoiceStateUpdate, (old, next) => {
    const changes = voiceChanges(old, next);
    if (changes.length) return general(next.guild.id, 'Événement vocal', [['Membre', actor(next.member?.user)], ['Changements', changes.join('\n')]]);
  });
  listen(Events.GuildMemberAdd, (m) => general(m.guild.id, 'Membre arrivé', [['Membre', actor(m.user)], ['Compte créé', `<t:${Math.floor(m.user.createdTimestamp / 1000)}:f>`]]));
  listen(Events.GuildMemberRemove, (m) => general(m.guild.id, 'Membre parti', [['Membre', actor(m.user)], ['Motif', 'Départ, kick ou ban : voir les actions d’audit lorsqu’elles existent.']]));
  listen(Events.GuildBanAdd, (ban) => general(ban.guild.id, 'Membre banni', [['Membre', actor(ban.user)], ['Raison', ban.reason || 'Voir le journal d’audit.']]));
  listen(Events.GuildBanRemove, (ban) => general(ban.guild.id, 'Ban levé', [['Membre', actor(ban.user)]]));
  listen(Events.GuildMemberUpdate, (old, next) => {
    const changes = [];
    if (old.nickname !== next.nickname) changes.push(`Pseudo : ${old.nickname || 'aucun'} → ${next.nickname || 'aucun'}`);
    const added = next.roles.cache.filter((r) => !old.roles.cache.has(r.id));
    const removed = old.roles.cache.filter((r) => !next.roles.cache.has(r.id));
    if (added.size) changes.push(`Rôles ajoutés : ${added.map((r) => `${r.name} (${r.id})`).join(', ')}`);
    if (removed.size) changes.push(`Rôles retirés : ${removed.map((r) => `${r.name} (${r.id})`).join(', ')}`);
    if (old.communicationDisabledUntilTimestamp !== next.communicationDisabledUntilTimestamp) {
      changes.push(next.communicationDisabledUntilTimestamp > Date.now() ? `Timeout jusqu’au <t:${Math.floor(next.communicationDisabledUntilTimestamp / 1000)}:f>` : 'Timeout levé / expiré');
    }
    if (changes.length) return general(next.guild.id, 'Membre modifié', [['Membre', actor(next.user)], ['Changements', changes.join('\n')]]);
  });
  listen(Events.GuildAuditLogEntryCreate, (entry, guild) => general(guild.id, 'Action administrative — journal d’audit',
    [['Action', `${AuditLogEvent[entry.action] || entry.action} (${entry.action})`], ['Auteur', actor(entry.executor) + (entry.executorId && !entry.executor ? ` — ${entry.executorId}` : '')],
      ['Cible', entry.targetId || 'Aucune'], ['Raison', entry.reason || 'Non renseignée'], ['Changements', JSON.stringify(entry.changes || [])], ['Détails', JSON.stringify(entry.extra || {})]],
    { files: [{ attachment: Buffer.from(JSON.stringify({ id: entry.id, action: entry.action, executorId: entry.executorId,
      targetId: entry.targetId, reason: entry.reason, changes: entry.changes }, null, 2)), name: `audit-${entry.id}.json` }] }));
  for (const [event, title] of [[Events.ChannelCreate, 'Salon créé'], [Events.ChannelDelete, 'Salon supprimé'],
    [Events.GuildRoleCreate, 'Rôle créé'], [Events.GuildRoleDelete, 'Rôle supprimé'],
    [Events.ThreadCreate, 'Fil créé'], [Events.ThreadDelete, 'Fil supprimé'],
    [Events.GuildEmojiCreate, 'Emoji créé'], [Events.GuildEmojiDelete, 'Emoji supprimé']]) {
    listen(event, (item) => item.guild && general(item.guild.id, title, [['Nom / ID', `${item.name} — ${item.id}`]]));
  }
  for (const [event, title] of [[Events.ChannelUpdate, 'Salon modifié'], [Events.GuildRoleUpdate, 'Rôle modifié'],
    [Events.ThreadUpdate, 'Fil modifié'], [Events.GuildUpdate, 'Serveur modifié'], [Events.GuildEmojiUpdate, 'Emoji modifié']]) {
    listen(event, (old, next) => {
      const guild = next.guild || (event === Events.GuildUpdate ? next : null);
      if (guild) return general(guild.id, title, [['Avant', `${old.name} — ${old.id}`], ['Après', `${next.name} — ${next.id}`],
        ['Détails', 'Les permissions et autres changements administratifs sont dans le journal d’audit.']]);
    });
  }
  listen(Events.InviteCreate, (invite) => invite.guild && general(invite.guild.id, 'Invitation créée', [['Code', invite.code], ['Auteur', actor(invite.inviter)], ['Salon', invite.channelId]]));
  listen(Events.InviteDelete, (invite) => invite.guild && general(invite.guild.id, 'Invitation supprimée', [['Code', invite.code], ['Salon', invite.channelId]]));
  return { onMessage, command };
}
