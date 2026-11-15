// Rounds and the match. One round is: a 12 s buy phase, up to 100 s of play, and a
// 35 s fuse if the bomb is planted. First to 4 rounds wins the match (max 7). The
// state machine only decides; main.js does the work (respawns, payouts, banners).
export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const FIRST_TO_WIN = 4;
export const MAX_ROUNDS = 7;

export function createRounds() {
  let phase = 'buy'; // buy | live | over
  let timer = BUY_TIME;
  let round = 1;
  let scoreAttacker = 0;
  let scoreDefender = 0;
  let lastResult = null; // { winner: 'attacker' | 'defender', reason: string }

  return {
    phase() {
      return phase;
    },
    timer() {
      return timer;
    },
    round() {
      return round;
    },
    scoreAttacker() {
      return scoreAttacker;
    },
    scoreDefender() {
      return scoreDefender;
    },
    lastResult() {
      return lastResult;
    },
    matchOver() {
      return scoreAttacker >= FIRST_TO_WIN || scoreDefender >= FIRST_TO_WIN || round > MAX_ROUNDS;
    },
    matchWinner() {
      if (scoreAttacker >= FIRST_TO_WIN) return 'attacker';
      if (scoreDefender >= FIRST_TO_WIN) return 'defender';
      if (round > MAX_ROUNDS) return scoreAttacker > scoreDefender ? 'attacker' : 'defender';
      return null;
    },
    startBuy() {
      phase = 'buy';
      timer = BUY_TIME;
      lastResult = null;
    },
    startLive() {
      phase = 'live';
      timer = ROUND_TIME;
    },
    // The fuse replaces the round clock once the bomb is planted.
    startFuse(seconds) {
      timer = seconds;
    },
    step(dt) {
      if (phase === 'over') return null;
      timer -= dt;
      if (timer <= 0) {
        timer = 0;
        return 'timeout';
      }
      return null;
    },
    // Close the round and move to the next buy phase. Returns the match winner when
    // the match is over, otherwise null.
    endRound(winner, reason) {
      if (winner === 'attacker') scoreAttacker += 1;
      else scoreDefender += 1;
      lastResult = { winner, reason };
      round += 1;
      phase = 'over';
      timer = 0;
      if (this.matchOver()) return this.matchWinner();
      return null;
    },
    resetMatch() {
      phase = 'buy';
      timer = BUY_TIME;
      round = 1;
      scoreAttacker = 0;
      scoreDefender = 0;
      lastResult = null;
    },
  };
}
