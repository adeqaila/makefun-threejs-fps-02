// The look plan, in one place. FERROLINE is a derelict rail foundry at dusk: warm dark
// steel, rust, and one molten accent. Team colours are the same discipline: attackers
// wear the accent, defenders a cold teal. The same names are the CSS custom properties
// in index.html, so the page and the scene never drift apart.
export const PALETTE = {
  canvas: '#1c1712',
  surface: '#332a1e',
  hairline: '#4b3e2c',
  ink: '#ece2cf',
  muted: '#9a8d76',
  accent: '#e07830',
  ember: '#ff9a3d',
  ward: '#3fa7a0',
};

export function shade(name) {
  return PALETTE[name];
}
