// Two inks for one design. Everything is drawn in `ink` at an opacity, so the same geometry works on
// GitHub's dark (#0d1117) and light (#ffffff) pages; text gets real colours for contrast.
export const THEMES = {
  dark: {
    name: 'dark', ink: '#fff', inv: '#000', page: '#0d1117',
    fg: '#EDEDED', fg2: '#9A9A9A', fg3: '#6E6E6E',
    hair: 0.09, card: 0.018, grid: 0.13, sweep: 0.55, engrave: 0.3, halo: 0.045, glyph: 0.55,
    lit: [0, 0.18, 0.36, 0.62, 0.95],
  },
  light: {
    name: 'light', ink: '#000', inv: '#fff', page: '#ffffff',
    fg: '#1F2328', fg2: '#59636E', fg3: '#8C959F',
    hair: 0.1, card: 0.012, grid: 0.13, sweep: 0.45, engrave: 0.6, halo: 0.03, glyph: 0.6,
    lit: [0, 0.13, 0.28, 0.52, 0.86],
  },
};

export const fmtDate = (iso) => new Date(iso + 'T12:00:00Z')
  .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
