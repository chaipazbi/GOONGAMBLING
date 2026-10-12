import { randomUUID } from 'node:crypto';

export const SHOP_REFRESH_COST = 5000;
export function newShop(date, roll) {
  return { date, revision: randomUUID(), slots: roll().map((id) => ({ id, bought: false })) };
}
export function shopRevision(user) { return user.shop?.revision || user.shop?.date; }
export function refreshShop(user, revision, date, roll) {
  if (!user.shop || user.shop.date !== date || shopRevision(user) !== revision) return { ok: false, reason: 'stale' };
  if (user.balance < SHOP_REFRESH_COST) return { ok: false, reason: 'balance' };
  const shop = newShop(date, roll);
  user.balance -= SHOP_REFRESH_COST;
  user.shop = shop;
  return { ok: true };
}
