// Intégration au système de paris existant. Les dépendances sont injectées pour les tests.
export function createTrackerBets({ bets, ui, persist, botId, applySettlement = () => {}, now = Date.now }) {
  let lastApiError = '';
  async function updateMessage(client, bet) {
    if (!bet.channelId || !bet.messageId) return;
    const ch = await client.channels.fetch(bet.channelId);
    const message = await ch.messages.fetch(bet.messageId);
    await message.edit({ embeds: [ui.betEmbed(bet)], components: ui.betComponents(bet) });
  }
  async function start(guildId, player, game, matchId, channel) {
    // Ne pas créer de pari si le match a déjà plus de 3 minutes ou si Riot n'a pas fourni son début.
    const startTime = Number(game.gameStartTime);
    if (!startTime || startTime > now() || now() >= startTime + 180000) return;
    let bet = bets.listBets(guildId).find((b) => b.tracker?.matchId === matchId && b.tracker.discordId === player.discordId);
    if (!bet) {
      bet = bets.createBet({ guildId, creatorId: botId(), title: `LoL : ${player.riotId} — victoire ou défaite ?`, options: ['Victoire', 'Défaite'] });
      bet.tracker = { matchId, puuid: player.puuid, discordId: player.discordId,
        closeAt: Math.min(now() + 120000, startTime + 180000), expiresAt: startTime + 6 * 60 * 60 * 1000,
        resultNotified: false, messageDirty: false };
      persist();
    }
    if (!bet.messageId && bet.status === 'open') {
      const m = await channel.send({ content: `🎲 Pari sur la partie de <@${player.discordId}> — GoonCoins uniquement.`,
        embeds: [ui.betEmbed(bet)], components: ui.betComponents(bet), allowedMentions: { parse: [] } });
      bets.setBetMessage(bet, channel.id, m.id);
    }
    return bet;
  }
  function closeExpired(guildId) {
    for (const bet of bets.listBets(guildId)) {
      if (bet.tracker && bet.status === 'open' && now() >= bet.tracker.closeAt) {
        bets.setStatus(bet, 'closed'); bet.tracker.messageDirty = true; persist();
      }
    }
  }
  async function sync(guildId, client, api) {
    closeExpired(guildId);
    for (const bet of bets.listBets(guildId)) {
      if (!bet.tracker) continue;
      if (bet.status === 'open' || bet.status === 'closed') {
        if (now() >= bet.tracker.expiresAt) {
          bets.refundAll(bet); bet.tracker.messageDirty = true; persist();
        }
        let match = null;
        if (bet.status !== 'cancelled') {
          try { match = await api.match(bet.tracker.matchId); }
          catch (err) {
            if (lastApiError !== err.message) console.error('Résultat du pari suivi :', err.message);
            lastApiError = err.message;
          }
        }
        if (match?.info?.gameEndTimestamp) {
          const p = match.info.participants.find((p) => p.puuid === bet.tracker.puuid);
          if (!p || (match.info.gameDuration < 300 && p.gameEndedInEarlySurrender)) bets.refundAll(bet);
          else { bets.settle(bet, p.win ? 'Victoire' : 'Défaite'); applySettlement(bet); }
          bet.tracker.messageDirty = true;
          persist();
        }
      }
      if (bet.tracker.messageDirty) {
        try { await updateMessage(client, bet); bet.tracker.messageDirty = false; persist(); }
        catch (err) { console.error('Actualisation du pari suivi :', err.message); }
      }
      if ((bet.status === 'resolved' || bet.status === 'cancelled') && !bet.tracker.resultNotified && bet.channelId) {
        const ch = await client.channels.fetch(bet.channelId);
        await ch.send(bet.status === 'resolved'
          ? { embeds: [ui.settlementEmbed(bet)], allowedMentions: { parse: [] } }
          : { content: `🔄 Pari #${bet.id} remboursé : partie écourtée, joueur absent du résultat, résultat indisponible après 6 heures ou annulation administrative.`, allowedMentions: { parse: [] } });
        bet.tracker.resultNotified = true; persist();
      }
    }
  }
  return { start, sync, closeExpired };
}
