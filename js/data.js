/* PARA-LIFE — maps, calls, shop catalogue */

const MAPS = [
  {
    id: "london",
    name: "London",
    region: "England",
    unlockLevel: 1,
    size: 48,
    tile: 40,
    palette: { grass: "#3d6b4f", road: "#2c3644", building: "#6b7c90", accent: "#c45c26" },
    hospital: { x: 8, y: 8 },
    station: { x: 10, y: 36 },
    // 0 empty/grass, 1 road H/V junctionable, 2 building
    layout: null, // generated
  },
  {
    id: "dublin",
    name: "Dublin",
    region: "Ireland",
    unlockLevel: 1,
    size: 44,
    tile: 40,
    palette: { grass: "#457a55", road: "#2a3340", building: "#7a6b5a", accent: "#2d6a4f" },
    hospital: { x: 34, y: 10 },
    station: { x: 6, y: 34 },
    layout: null,
  },
  {
    id: "manchester",
    name: "Manchester",
    region: "England",
    unlockLevel: 2,
    size: 46,
    tile: 40,
    palette: { grass: "#3a6550", road: "#283240", building: "#5c6e7e", accent: "#8b4513" },
    hospital: { x: 22, y: 6 },
    station: { x: 38, y: 38 },
    layout: null,
  },
  {
    id: "belfast",
    name: "Belfast",
    region: "N. Ireland",
    unlockLevel: 3,
    size: 42,
    tile: 40,
    palette: { grass: "#416b52", road: "#2b3542", building: "#6a7380", accent: "#1d4e89" },
    hospital: { x: 6, y: 20 },
    station: { x: 34, y: 34 },
    layout: null,
  },
  {
    id: "cork",
    name: "Cork",
    region: "Ireland",
    unlockLevel: 4,
    size: 40,
    tile: 40,
    palette: { grass: "#4a7558", road: "#2d3644", building: "#8a7060", accent: "#c1121f" },
    hospital: { x: 18, y: 8 },
    station: { x: 8, y: 30 },
    layout: null,
  },
  {
    id: "edinburgh",
    name: "Edinburgh",
    region: "Scotland",
    unlockLevel: 5,
    size: 44,
    tile: 40,
    palette: { grass: "#3f684e", road: "#27313e", building: "#7d6e5e", accent: "#003d6b" },
    hospital: { x: 30, y: 30 },
    station: { x: 8, y: 8 },
    layout: null,
  },
];

function generateCityLayout(map) {
  const n = map.size;
  const grid = Array.from({ length: n }, () => Array(n).fill(0));
  const seed = map.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  // Main road grid every 4–5 tiles
  const step = map.id === "london" ? 4 : map.id === "dublin" ? 5 : 4;
  for (let i = 2; i < n - 2; i += step) {
    for (let j = 1; j < n - 1; j++) {
      grid[i][j] = 1;
      grid[j][i] = 1;
    }
  }

  // Ring road
  for (let i = 1; i < n - 1; i++) {
    grid[1][i] = 1;
    grid[n - 2][i] = 1;
    grid[i][1] = 1;
    grid[i][n - 2] = 1;
  }

  // Diagonal arterial for character
  for (let i = 3; i < n - 3; i++) {
    if ((seed + i) % 7 !== 0) {
      const j = Math.min(n - 2, Math.max(1, Math.floor(i * 0.9) + (seed % 3)));
      grid[i][j] = 1;
      if (j + 1 < n - 1) grid[i][j + 1] = 1;
    }
  }

  // Buildings in blocks (not on roads)
  for (let y = 2; y < n - 2; y++) {
    for (let x = 2; x < n - 2; x++) {
      if (grid[y][x] === 1) continue;
      const nearRoad =
        grid[y - 1][x] === 1 ||
        grid[y + 1][x] === 1 ||
        grid[y][x - 1] === 1 ||
        grid[y][x + 1] === 1;
      const hash = (x * 17 + y * 31 + seed) % 10;
      if (nearRoad && hash < 6) grid[y][x] = 2;
      else if (!nearRoad && hash < 3) grid[y][x] = 2;
    }
  }

  // Clear hospital & station pads + access roads
  const clearPad = (cx, cy) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < n && y < n) grid[y][x] = 1;
      }
    }
  };
  clearPad(map.hospital.x, map.hospital.y);
  clearPad(map.station.x, map.station.y);

  map.layout = grid;
  return grid;
}

MAPS.forEach(generateCityLayout);

const CALL_TEMPLATES = [
  {
    cat: 1,
    title: "Cardiac Arrest",
    desc: "Unresponsive adult, bystander CPR in progress. Crowd gathering.",
    vitals: { hr: "0", bp: "—", spo2: "—" },
    decisions: [
      { id: "cpr", label: "Continue high-quality CPR + defibrillate", hint: "Best practice for ROSC", score: 100 },
      { id: "load", label: "Immediate load without defibrillation", hint: "Risky delay to shock", score: 40 },
      { id: "observe", label: "Observe and wait for backup", hint: "Cat 1 — every second counts", score: 10 },
    ],
    transport: [
      { id: "ed", label: "Nearest ED — lights & sirens", hint: "Correct for arrest", score: 100 },
      { id: "gp", label: "GP surgery", hint: "Inappropriate destination", score: 0 },
      { id: "home", label: "Leave on scene", hint: "Unsafe", score: 0 },
    ],
  },
  {
    cat: 1,
    title: "Severe Trauma RTC",
    desc: "Two-vehicle collision. Patient trapped, major haemorrhage.",
    vitals: { hr: "128", bp: "88/50", spo2: "92%" },
    decisions: [
      { id: "bleed", label: "Control haemorrhage + C-spine + extricate", hint: "Trauma priorities", score: 100 },
      { id: "pain", label: "Pain relief only, delay extrication", hint: "Bleeding first", score: 35 },
      { id: "walk", label: "Ask patient to walk to ambulance", hint: "Dangerous", score: 5 },
    ],
    transport: [
      { id: "mtc", label: "Major Trauma Centre — blue lights", hint: "Correct pathway", score: 100 },
      { id: "ed", label: "Local ED without pre-alert", hint: "Suboptimal", score: 50 },
      { id: "wait", label: "Stay on scene for full secondary survey", hint: "Too slow", score: 25 },
    ],
  },
  {
    cat: 1,
    title: "Anaphylaxis",
    desc: "Teen with peanut allergy. Facial swelling, stridor developing.",
    vitals: { hr: "140", bp: "78/42", spo2: "90%" },
    decisions: [
      { id: "adra", label: "IM adrenaline 1:1000 + oxygen + fluids", hint: "Guideline first-line", score: 100 },
      { id: "antih", label: "Antihistamine only", hint: "Not enough alone", score: 30 },
      { id: "water", label: "Offer water and reassure", hint: "Life-threatening", score: 0 },
    ],
    transport: [
      { id: "ed", label: "ED — pre-alert, lights & sirens", hint: "Correct", score: 100 },
      { id: "observe", label: "Observe 10 mins then reassess", hint: "Risky delay", score: 40 },
      { id: "refuse", label: "Accept refusal without advice", hint: "Unsafe", score: 0 },
    ],
  },
  {
    cat: 2,
    title: "Suspected Stroke",
    desc: "Elderly patient, facial droop, arm weakness, speech slurred. Onset 40 mins ago.",
    vitals: { hr: "88", bp: "178/96", spo2: "97%" },
    decisions: [
      { id: "fast", label: "FAST positive — pre-alert stroke pathway", hint: "Time-critical", score: 100 },
      { id: "gp", label: "Advise see GP tomorrow", hint: "Too slow", score: 10 },
      { id: "sleep", label: "Suggest rest and fluids", hint: "Dangerous", score: 0 },
    ],
    transport: [
      { id: "hyper", label: "Hyper-acute stroke unit", hint: "Correct destination", score: 100 },
      { id: "ed", label: "Any ED without pre-alert", hint: "Missed pathway", score: 45 },
      { id: "home", label: "Home with safety-netting only", hint: "Inappropriate", score: 5 },
    ],
  },
  {
    cat: 2,
    title: "Chest Pain — ACS?",
    desc: "52-year-old with crushing central chest pain radiating to left arm. Diaphoretic.",
    vitals: { hr: "102", bp: "148/90", spo2: "96%" },
    decisions: [
      { id: "ecg", label: "12-lead ECG + aspirin + GTN as indicated", hint: "ACS protocol", score: 100 },
      { id: "paracetamol", label: "Paracetamol and observation", hint: "Insufficient", score: 25 },
      { id: "dismiss", label: "Likely indigestion — discharge", hint: "High risk miss", score: 0 },
    ],
    transport: [
      { id: "pci", label: "PCI-capable centre if STEMI", hint: "Correct", score: 100 },
      { id: "ed", label: "Local ED for further tests", hint: "Acceptable if NSTEMI", score: 70 },
      { id: "home", label: "Home with GP follow-up", hint: "Unsafe", score: 5 },
    ],
  },
  {
    cat: 2,
    title: "Seizure — Post-ictal",
    desc: "Known epileptic. Prolonged seizure stopped with midazolam. Still post-ictal.",
    vitals: { hr: "110", bp: "132/84", spo2: "94%" },
    decisions: [
      { id: "airway", label: "Airway support, O2, check BGL, protect", hint: "Solid care", score: 100 },
      { id: "shake", label: "Shake patient awake forcefully", hint: "Wrong", score: 15 },
      { id: "leave", label: "Leave with family immediately", hint: "Needs assessment", score: 20 },
    ],
    transport: [
      { id: "ed", label: "ED for prolonged seizure work-up", hint: "Appropriate", score: 100 },
      { id: "home", label: "Home if known epilepsy & recovered", hint: "Possible with criteria", score: 60 },
      { id: "walk", label: "Walk to pharmacy", hint: "No", score: 0 },
    ],
  },
  {
    cat: 3,
    title: "Minor Fall — Elderly",
    desc: "Slip in kitchen. No LOC. Isolated wrist injury. Alert and oriented.",
    vitals: { hr: "76", bp: "138/82", spo2: "98%" },
    decisions: [
      { id: "assess", label: "Full assessment, immobilise wrist, pain relief", hint: "Good care", score: 100 },
      { id: "ignore", label: "No examination needed", hint: "Poor practice", score: 15 },
      { id: "collar", label: "Full spinal board for all elderly falls", hint: "Over-triage", score: 40 },
    ],
    transport: [
      { id: "utc", label: "Urgent Treatment Centre / minor injuries", hint: "Suitable", score: 100 },
      { id: "ed", label: "ED blue lights", hint: "Unnecessary urgency", score: 40 },
      { id: "refuse", label: "No advice given, leave", hint: "Incomplete", score: 20 },
    ],
  },
  {
    cat: 3,
    title: "Abdominal Pain",
    desc: "Young adult, gradual onset lower abdominal pain. Stable vitals. No red flags.",
    vitals: { hr: "82", bp: "118/74", spo2: "99%" },
    decisions: [
      { id: "hx", label: "History, abdomen exam, pain score, safety-net", hint: "Thorough", score: 100 },
      { id: "morphine", label: "High-dose opioids immediately", hint: "Premature", score: 35 },
      { id: "dismiss", label: "Tell them it's nothing", hint: "Unprofessional", score: 5 },
    ],
    transport: [
      { id: "ed", label: "ED for further investigation", hint: "Reasonable", score: 90 },
      { id: "gp", label: "GP / 111 pathway if low risk", hint: "Acceptable option", score: 85 },
      { id: "siren", label: "Cat 1 response to hospital", hint: "Overkill", score: 30 },
    ],
  },
  {
    cat: 3,
    title: "Mental Health Crisis",
    desc: "Patient distressed, expressing hopelessness. No immediate physical threat. Safe environment.",
    vitals: { hr: "90", bp: "124/78", spo2: "98%" },
    decisions: [
      { id: "listen", label: "Calm engagement, risk assess, involve MH pathway", hint: "Best approach", score: 100 },
      { id: "restrain", label: "Physical restraint immediately", hint: "Escalates risk", score: 10 },
      { id: "joke", label: "Minimise feelings", hint: "Harmful", score: 0 },
    ],
    transport: [
      { id: "edmh", label: "ED with mental health liaison", hint: "Often appropriate", score: 95 },
      { id: "crisis", label: "Crisis team / safe space referral", hint: "Good if available", score: 100 },
      { id: "leave", label: "Leave without plan", hint: "Unsafe", score: 0 },
    ],
  },
];

const SHOP_ITEMS = [
  {
    id: "boots",
    name: "Tactical Boots",
    desc: "Grip for wet UK pavements.",
    icon: "🥾",
    price: 2.99,
    boost: { xp: 1.1, score: 1.05 },
    boostLabel: "+10% XP · +5% score",
  },
  {
    id: "trousers",
    name: "Tactical Trousers",
    desc: "Cargo pockets for quick-draw kit.",
    icon: "👖",
    price: 2.99,
    boost: { xp: 1.05, score: 1.1 },
    boostLabel: "+5% XP · +10% score",
  },
  {
    id: "stethoscope",
    name: "Stethoscope",
    desc: "Sharper assessments on scene.",
    icon: "🩺",
    price: 2.99,
    boost: { xp: 1.15, score: 1.1 },
    boostLabel: "+15% XP · +10% score",
  },
  {
    id: "bag",
    name: "Response Bag",
    desc: "Organise airways, drugs & dressings.",
    icon: "🎒",
    price: 2.99,
    boost: { xp: 1.1, score: 1.15 },
    boostLabel: "+10% XP · +15% score",
  },
  {
    id: "hi-vis",
    name: "Hi-Vis Jacket",
    desc: "Seen on motorways & night jobs.",
    icon: "🦺",
    price: 2.99,
    boost: { xp: 1.08, score: 1.08 },
    boostLabel: "+8% XP · +8% score",
  },
  {
    id: "defib",
    name: "Spare Defib Pads",
    desc: "Confidence on Cat 1 arrests.",
    icon: "⚡",
    price: 2.99,
    boost: { xp: 1.2, score: 1.12 },
    boostLabel: "+20% XP · +12% score",
  },
  {
    id: "torch",
    name: "Tactical Torch",
    desc: "Night shifts on rural lanes.",
    icon: "🔦",
    price: 2.99,
    boost: { xp: 1.05, score: 1.05 },
    boostLabel: "+5% XP · +5% score",
  },
  {
    id: "gloves",
    name: "Trauma Gloves Pack",
    desc: "Protection on every job.",
    icon: "🧤",
    price: 2.99,
    boost: { xp: 1.06, score: 1.06 },
    boostLabel: "+6% XP · +6% score",
  },
];

const RANKS = [
  { level: 1, title: "Student Para" },
  { level: 2, title: "Newly Qualified" },
  { level: 3, title: "Band 5 Paramedic" },
  { level: 4, title: "Senior Clinician" },
  { level: 5, title: "Critical Care Para" },
  { level: 6, title: "HART Operative" },
  { level: 7, title: "Advanced Practitioner" },
  { level: 8, title: "Consultant Paramedic" },
  { level: 9, title: "Sector Commander" },
  { level: 10, title: "Chief of Response" },
];

function xpForLevel(level) {
  return Math.floor(120 * Math.pow(1.45, level - 1));
}

function rankForLevel(level) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.level) rank = r;
  }
  return rank;
}

function pickCall(preferCat) {
  const pool = preferCat
    ? CALL_TEMPLATES.filter((c) => c.cat === preferCat)
    : CALL_TEMPLATES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function worldPos(map, tileX, tileY) {
  return {
    x: (tileX + 0.5) * map.tile,
    y: (tileY + 0.5) * map.tile,
  };
}

function findNearestRoad(map, tx, ty) {
  const n = map.size;
  let best = { x: tx, y: ty, d: Infinity };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (map.layout[y][x] !== 1) continue;
      const d = Math.abs(x - tx) + Math.abs(y - ty);
      if (d < best.d) best = { x, y, d };
    }
  }
  return best;
}

function randomRoadTile(map, avoid = [], minDist = 6) {
  const roads = [];
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      if (map.layout[y][x] !== 1) continue;
      const tooClose = avoid.some(
        (a) => Math.abs(a.x - x) + Math.abs(a.y - y) < minDist
      );
      if (!tooClose) roads.push({ x, y });
    }
  }
  return roads[Math.floor(Math.random() * roads.length)] || { x: 5, y: 5 };
}

/** Prefer jobs a short drive from station so shifts stay punchy on mobile. */
function pickCallNearStation(map) {
  const station = map.station;
  const candidates = [];
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      if (map.layout[y][x] !== 1) continue;
      const d =
        Math.abs(x - station.x) +
        Math.abs(y - station.y);
      const dh =
        Math.abs(x - map.hospital.x) +
        Math.abs(y - map.hospital.y);
      if (d >= 5 && d <= 14 && dh >= 4) candidates.push({ x, y, d });
    }
  }
  if (!candidates.length) return randomRoadTile(map, [map.hospital, map.station], 5);
  return candidates[Math.floor(Math.random() * candidates.length)];
}
