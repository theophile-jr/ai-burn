// UI translations. JSON output stays English — it's a machine interface.
export const LANGS = ["en", "fr"];

/** "fr" when the user's locale says so, otherwise "en". */
export function detectLang(env = process.env) {
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
  return /^fr/i.test(locale) ? "fr" : "en";
}

const EN = {
  consent:
    "ai-burn reads the local history of your AI coding tools (Claude Code, Gemini CLI, Codex, Cursor, OpenCode) to count tokens. Everything stays on this machine. Read them?",
  consentDeclined: "Okay — nothing was read.",
  subtitle: (window) => `— what your AI burned (${window})`,
  allTime: "all time",
  lastDays: (n) => `last ${n} day${n === 1 ? "" : "s"}`,
  empty: "No AI tool history found. Spotless. Suspiciously spotless. 🌿",
  co2e: "CO₂e",
  ofWater: "of water",
  atApiPrices: "at API prices",
  toNext: (pct, next, kg) => `${pct}% to ${next} (${kg})`,
  maxRank: "Maximum rank reached.",
  thatsLike: "That's like…",
  machinesDrank: "…and your machines drank",
  lakeGeneva: "of Lake Geneva",
  byTool: "By tool",
  perDay: "/day",
  worst: "peak day:",
  topModel: "top model:",
  tokens: "tokens",
  footer:
    "Rough estimates — run with --json for raw numbers, README for methodology.",
  rankNames: {},
  eqLabels: {},
  units: {},
};

const FR = {
  consent:
    "ai-burn lit l'historique local de vos outils d'IA (Claude Code, Gemini CLI, Codex, Cursor, OpenCode) pour compter les jetons. Tout reste sur cette machine. Les lire ?",
  consentDeclined: "D'accord — rien n'a été lu.",
  subtitle: (window) => `— ce que votre IA a brûlé (${window})`,
  allTime: "depuis toujours",
  lastDays: (n) => `${n} dernier${n === 1 ? "" : "s"} jour${n === 1 ? "" : "s"}`,
  empty: "Aucun historique d'outil IA trouvé. Impeccable. Suspectement impeccable. 🌿",
  co2e: "CO₂e",
  ofWater: "d'eau",
  atApiPrices: "au tarif API",
  toNext: (pct, next, kg) => `${pct}% vers ${next} (${kg})`,
  maxRank: "Rang maximal atteint.",
  thatsLike: "C'est comme…",
  machinesDrank: "…et vos machines ont bu",
  lakeGeneva: "du lac Léman",
  byTool: "Par outil",
  perDay: "/jour",
  worst: "pic :",
  topModel: "modèle n°1 :",
  tokens: "jetons",
  footer:
    "Estimations approximatives — --json pour les chiffres bruts, README pour la méthodologie.",
  rankNames: {
    "Carbon Seedling": "Pousse de Carbone",
    "Gentle Breeze": "Brise Légère",
    "Pedal Pusher": "Coup de Pédale",
    "Scooter Smogger": "Scootériste Fumant",
    "Sunday Driver": "Conducteur du Dimanche",
    "Daily Commuter": "Navetteur Quotidien",
    "Diesel Hauler": "Routier Diesel",
    "Frequent Flyer": "Grand Voyageur",
    "Smoke Stack Tycoon": "Magnat des Cheminées",
    "Pocket Volcano": "Volcan de Poche",
  },
  eqLabels: {
    "in a petrol car": "en voiture essence",
    cheeseburgers: "cheeseburgers",
    "party balloons of pure CO₂": "ballons de baudruche de CO₂ pur",
    "of Arctic sea ice, gone": "de banquise arctique, envolés",
    "phone charges": "recharges de téléphone",
    "of video streaming": "de streaming vidéo",
    "for one tree to re-absorb it": "pour qu'un arbre le réabsorbe",
    "of a Paris→NYC flight": "d'un vol Paris→NYC",
    "espresso shots, evaporated": "expressos, évaporés",
    "half-litre bottles": "bouteilles d'un demi-litre",
    raindrops: "gouttes de pluie",
    bathtubs: "baignoires",
    "Olympic pools": "piscines olympiques",
  },
  units: { days: "jours" },
};

const STRINGS = { en: EN, fr: FR };

export function getStrings(lang) {
  return STRINGS[lang] ?? EN;
}

/** Translate an equivalent's label / unit / a rank name, falling back to English. */
export function tr(L, kind, key) {
  return L[kind]?.[key] ?? key;
}
