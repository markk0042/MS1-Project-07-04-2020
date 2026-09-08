/* PARA-LIFE — persistent player state */

const SAVE_KEY = "paralife_save_v1";

const defaultState = () => ({
  level: 1,
  xp: 0,
  xpIntoLevel: 0,
  coins: 15, // starter euros from completed demo shifts
  callsCompleted: 0,
  shiftsCompleted: 0,
  bestScore: 0,
  owned: [],
  equipped: [],
  totalDistance: 0,
});

const GameState = {
  data: defaultState(),

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        this.data = { ...defaultState(), ...JSON.parse(raw) };
      }
    } catch {
      this.data = defaultState();
    }
    return this.data;
  },

  save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
  },

  owns(id) {
    return this.data.owned.includes(id);
  },

  isEquipped(id) {
    return this.data.equipped.includes(id);
  },

  purchase(id) {
    if (this.owns(id)) return false;
    this.data.owned.push(id);
    this.data.equipped.push(id);
    this.save();
    return true;
  },

  toggleEquip(id) {
    if (!this.owns(id)) return;
    if (this.isEquipped(id)) {
      this.data.equipped = this.data.equipped.filter((x) => x !== id);
    } else {
      this.data.equipped.push(id);
    }
    this.save();
  },

  getBoosts() {
    let xp = 1;
    let score = 1;
    for (const id of this.data.equipped) {
      const item = SHOP_ITEMS.find((i) => i.id === id);
      if (!item) continue;
      xp *= item.boost.xp;
      score *= item.boost.score;
    }
    return { xp, score };
  },

  addRewards({ xp, score, coins, distance }) {
    const boosts = this.getBoosts();
    const gainedXp = Math.round(xp * boosts.xp);
    const gainedScore = Math.round(score * boosts.score);
    const gainedCoins = coins || 0;

    this.data.xp += gainedXp;
    this.data.xpIntoLevel += gainedXp;
    this.data.coins += gainedCoins;
    this.data.callsCompleted += 1;
    this.data.totalDistance += distance || 0;
    if (gainedScore > this.data.bestScore) this.data.bestScore = gainedScore;

    let leveled = 0;
    while (this.data.xpIntoLevel >= xpForLevel(this.data.level)) {
      this.data.xpIntoLevel -= xpForLevel(this.data.level);
      this.data.level += 1;
      leveled += 1;
    }

    this.save();
    return { gainedXp, gainedScore, gainedCoins, leveled, level: this.data.level };
  },

  completeShift() {
    this.data.shiftsCompleted += 1;
    this.save();
  },

  levelProgress() {
    const need = xpForLevel(this.data.level);
    return Math.min(1, this.data.xpIntoLevel / need);
  },
};

GameState.load();
