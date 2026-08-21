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
const HOUSE_EDGE = parseFloat(process.env.HORSE_EDGE || '-0.03');

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Crée 4 chevaux avec des forces aléatoires -> probabilités -> cotes affichées.
export function makeRace() {
  const noms = shuffle(UMA_NAMES).slice(0, 4);

  // Forces aléatoires, converties en probabilités réelles de victoire.
  const forces = noms.map(() => 0.5 + Math.random() * 1.5);
  const somme = forces.reduce((a, b) => a + b, 0);
  const probs = forces.map((f) => f / somme);

  // Cote affichée = (1/prob) réduite par l'avantage maison, bornée et arrondie.
  const horses = noms.map((nom, i) => {
    const fair = 1 / probs[i];
    let cote = fair * (1 - HOUSE_EDGE);
    cote = Math.max(1.2, Math.round(cote * 10) / 10);
    return { nom, prob: probs[i], cote };
  });

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
