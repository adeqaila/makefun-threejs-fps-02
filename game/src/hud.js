// The HUD: plain DOM over the canvas. One function per element, no framework, and
// every update goes through here so main.js never touches the DOM directly.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const healthNum = $('health-num');
  const healthFill = $('health-fill');
  const armorNum = $('armor-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadesNum = $('grenades-num');
  const moneyNum = $('money-num');
  const timerNum = $('timer-num');
  const roundLabel = $('round-label');
  const scoreA = $('score-a');
  const scoreD = $('score-d');
  const killfeed = $('killfeed');
  const bombStatus = $('bomb-status');
  const bombFill = $('bomb-fill');
  const buyMenu = $('buy-menu');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayBody = $('overlay-body');
  const overlayButton = $('overlay-button');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('damage-vignette');
  let bannerTimer = null;
  let hitTimer = null;

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(health, armor) {
      healthNum.textContent = String(Math.max(0, Math.ceil(health)));
      healthFill.style.width = `${Math.max(0, Math.min(100, health))}%`;
      healthFill.classList.toggle('low', health <= 30);
      armorNum.textContent = String(Math.max(0, Math.ceil(armor)));
    },
    setAmmo(mag, reserve, reloading) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = String(reserve);
      ammoMag.classList.toggle('reloading', reloading);
    },
    setWeapon(name) {
      weaponName.textContent = name;
    },
    setGrenades(count) {
      grenadesNum.textContent = String(count);
    },
    setMoney(money) {
      moneyNum.textContent = `$${money}`;
    },
    setTimer(seconds, urgent) {
      timerNum.textContent = fmtTime(seconds);
      timerNum.classList.toggle('urgent', Boolean(urgent));
    },
    setRound(round, maxRounds) {
      roundLabel.textContent = `ROUND ${round} / ${maxRounds}`;
    },
    setScore(a, d) {
      scoreA.textContent = String(a);
      scoreD.textContent = String(d);
    },
    setBomb(text, progress) {
      bombStatus.textContent = text;
      bombFill.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
      bombStatus.classList.toggle('planted', text.includes('PLANTED'));
    },
    setPhase(phase) {
      timerNum.dataset.phase = phase;
    },
    setCrosshairSpread(spreadPx) {
      crosshair.style.setProperty('--spread', `${spreadPx}px`);
    },
    killfeedLine(text) {
      const line = document.createElement('div');
      line.className = 'killfeed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(title, sub = '') {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('show'), 3200);
    },
    showBuy(show) {
      buyMenu.classList.toggle('show', show);
    },
    setBuyAffordability(money, prices) {
      for (const [key, price] of Object.entries(prices)) {
        const row = document.querySelector(`[data-buy="${key}"]`);
        if (row) row.classList.toggle('cant-afford', money < price);
      }
    },
    hitmarker(kill) {
      hitmarker.classList.add('show');
      hitmarker.classList.toggle('kill', kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('show', 'kill'), 140);
    },
    damageFlash() {
      vignette.classList.add('show');
      setTimeout(() => vignette.classList.remove('show'), 180);
    },
    showOverlay(title, body, buttonLabel, onButton) {
      overlayTitle.textContent = title;
      overlayBody.textContent = body;
      overlayButton.textContent = buttonLabel;
      overlay.classList.add('show');
      overlayButton.onclick = onButton;
    },
    hideOverlay() {
      overlay.classList.remove('show');
    },
  };
}
