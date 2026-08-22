// Course de chevaux : 4 chevaux nommés d'après Umamusume.
// Cotes fixes affichées au départ. Cote haute = moins de chances (mais possible).
// Léger avantage maison : la somme des probabilités implicites dépasse 100 %.
import { config } from './config.js';

// Réservoir de noms (Umamusume). On en tire 4 par course.
const UMA_NAMES = [
  'Special Week', 'Silence Suzuka', 'Tokai Teio', 'Maruzensky', 'Gold Ship',
  'Vodka', 'Daiwa Scarlet', 'Rice Shower', 'Mejiro McQueen', 'Symboli Rudolf',
  'Oguri Cap', 'Taiki Shuttle', 'Grass Wonder', 'El Condor Pasa', 'Air Groove',
  'Agnes Tachyon', 'Manhattan Cafe', 'Gold City', 'Fine Motion', 'Haru Urara',
  'Matikanefukukitaru', 'Mihono Bourbon', 'Biwa Hayahide', 'Narita Brian',
  'Sakura Bakushin O', 'Nice Nature', 'King Halo', 'Winning Ticket',
];

// Négatif = avantage joueur. -0.03 => les joueurs ont +3 % (RTP ~103 %).
const HOUSE_EDGE = parseFloat(process.env.HORSE_EDGE || '-0.08');

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Plancher de probabilité : borne les cotes les plus hautes (~15 max).
const PROB_MIN = 0.08;

// Crée 4 chevaux avec un écart marqué -> vrais favoris (cote basse, ils gagnent
// souvent mais paient peu) et vrais outsiders (cote haute, gros gain mais rares).
function genererChevaux(noms) {
  // Écart accentué (puissance) pour bien différencier les chevaux.
  const forces = noms.map(() => Math.pow(0.1 + Math.random(), 1.6));
  let somme = forces.reduce((a, b) => a + b, 0);
  let probs = forces.map((f) => f / somme);

  // Plancher puis renormalisation : aucun cheval n'est totalement sans chance.
  probs = probs.map((p) => Math.max(PROB_MIN, p));
  somme = probs.reduce((a, b) => a + b, 0);
  probs = probs.map((p) => p / somme);

  // Cote = (1/prob) ajustée par l'avantage (négatif = avantage joueur), arrondie.
  return noms.map((nom, i) => {
    let cote = (1 / probs[i]) * (1 - HOUSE_EDGE);
    cote = Math.max(1.3, Math.round(cote * 10) / 10);
    return { nom, prob: probs[i], cote };
  });
}

export function makeRace() {
  const noms = shuffle(UMA_NAMES).slice(0, 4);

  // On régénère si deux chevaux tombent sur la même cote (plus lisible).
  let horses;
  for (let essai = 0; essai < 20; essai++) {
    horses = genererChevaux(noms);
    if (new Set(horses.map((h) => h.cote)).size === horses.length) break;
  }

  return { horses, createdAt: Date.now() };
}

// Tire le gagnant selon les probabilités réelles (pas les cotes affichées).
export function runRace(race) {
  let r = Math.random();
  for (let i = 0; i < race.horses.length; i++) {
    r -= race.horses[i].prob;
    if (r < 0) return i;
  }
  return race.horses.length - 1;
}

export { UMA_NAMES };
