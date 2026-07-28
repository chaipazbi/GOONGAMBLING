// Date et heure locales dans le fuseau configuré, sans dépendance externe.
import { config } from './config.js';

function parts(date) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

// { date: "2026-07-25", time: "09:30" }
export function localeNow() {
  return parts(new Date());
}

// "2026-07-25"
export function today() {
  return parts(new Date()).date;
}

// Convertit un timestamp (ms) en date locale "YYYY-MM-DD", ou null si 0/absent.
export function dateOf(ms) {
  return ms ? parts(new Date(ms)).date : null;
}
