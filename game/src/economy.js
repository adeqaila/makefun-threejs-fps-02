// The economy: money earned each round and spent in the buy menu. Numbers are
// Counter-Strike-style, scaled down to a 7-round match: a win pays more than a loss,
// kills and plants pay a little, and the first round is a pistol round on $800.
// Ownership of weapons lives in the arsenal; this module only moves money.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const START_MONEY = 800;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;

export function createEconomy() {
  let money = START_MONEY;
  let armor = 0;
  let lossStreak = 0;

  function priceOf(key) {
    if (key === '1') return WEAPONS.rifle.price;
    if (key === '2') return WEAPONS.smg.price;
    if (key === '3') return GRENADE_PRICE;
    if (key === '4') return ARMOR_PRICE;
    return null;
  }

  return {
    money() {
      return money;
    },
    armor() {
      return armor;
    },
    priceOf,
    // Charge for a menu key the caller has already validated. Returns true if paid.
    pay(key) {
      const price = priceOf(key);
      if (price === null || money < price) return false;
      money -= price;
      if (key === '4') armor = 50;
      return true;
    },
    addKill() {
      money += KILL_REWARD;
    },
    addPlant() {
      money += PLANT_REWARD;
    },
    // End-of-round payout. A loss streak pays a little more each time, up to 3.
    endRound(won) {
      if (won) {
        money += WIN_REWARD;
        lossStreak = 0;
      } else {
        lossStreak = Math.min(3, lossStreak + 1);
        money += LOSS_REWARD + (lossStreak - 1) * 500;
      }
    },
    resetMatch() {
      money = START_MONEY;
      armor = 0;
      lossStreak = 0;
    },
    // Armor soaks half of each hit until it is gone.
    absorb(damage) {
      if (armor <= 0) return damage;
      const soaked = Math.min(armor, Math.ceil(damage / 2));
      armor -= soaked;
      return damage - soaked;
    },
  };
}
