// Every word and link on the profile lives here. Edit, then run `npm run build`.

export const name = 'Feruz Karimov';
export const tagline = 'Builds products, and the models behind them.';
export const heroNote = 'Not typeset. Light, bent by a pane of glass.';

// Every image needs a real link: GitHub wraps unlinked images in a link to the raw file, which breaks
// the <picture> swap. These are the quiet ones (hero, section labels, footer).
const repos = 'https://github.com/feruzkarimovv?tab=repositories';
export const links = {
  hero: 'https://github.com/feruzkarimovv/feruzkarimovv/tree/main/src/render',
  work: repos, also: repos, now: 'https://x.com/feruzkrm', contact: 'mailto:feruz.karimov@rutgers.edu',
  footer: 'https://github.com/feruzkarimovv/feruzkarimovv/tree/main/src',
};

// `shot` is the live page captured into src/shots by tools/shoot.mjs; `chart` draws a figure instead.
export const work = [
  {
    id: 'jonivor', title: 'Jonivor', kind: 'Product',
    blurb: 'Online vet care for Uzbekistan: web, iOS and a Telegram Mini App.',
    metric: '1,000+ accounts', href: 'https://jonivor.com.uz',
    shot: 'https://jonivor.com.uz', domain: 'jonivor.com.uz',
  },
  {
    id: 'kestrel', title: 'kestrel-4b', kind: 'Model',
    blurb: 'A 4B model trained to out-call models 8× its size on tool use.',
    metric: 'BFCL v4 · in training', href: 'https://gorilla.cs.berkeley.edu/leaderboard.html',
    // BFCL v4 overall, leaderboard of 2025-12-16; kestrel's bar is its target, drawn dashed.
    chart: [['Qwen3-4B, base', 35.68], ['Qwen3-8B', 42.57], ['Qwen3-32B', 48.71], ['kestrel-4b, target', 48.8, 'target']],
  },
  {
    id: 'vannaris', title: 'Vannaris', kind: 'Benchmark',
    blurb: 'Independent benchmark of the web-search APIs AI agents rely on.',
    metric: '5 APIs · 3 judge labs', href: 'https://vannaris.com',
    shot: 'https://vannaris.com', domain: 'vannaris.com',
  },
];

export const also = [
  { id: 'between-visits', title: 'Between Visits', blurb: 'Voice agent that checks on trial patients between visits.', href: 'https://github.com/feruzkarimovv/between-visits' },
  { id: 'gha-graph', title: 'gha-graph', blurb: 'See and lint GitHub Actions workflows before you push.', href: 'https://github.com/feruzkarimovv/gha-graph' },
  { id: 'vibeduel', title: 'VibeDuel', blurb: 'Race a friend to build an app with Claude. AI judge, ELO.', href: 'https://github.com/feruzkarimovv/vibeduel' },
  { id: 'vibecheck', title: 'VibeCheck', blurb: 'Finds the security bugs AI coding tools tend to write.', href: 'https://github.com/feruzkarimovv/vibecheck' },
];

export const now = { line: 'Building something new.', aside: 'CS + Data Science · Rutgers ’28' };

export const contact = [
  { id: 'email', label: 'Email', value: 'feruz.karimov@rutgers.edu', href: 'mailto:feruz.karimov@rutgers.edu' },
  { id: 'x', label: 'X', value: '@feruzkrm', href: 'https://x.com/feruzkrm' },
  { id: 'linkedin', label: 'LinkedIn', value: 'in/feruzlkarimov', href: 'https://www.linkedin.com/in/feruzlkarimov' },
  { id: 'site', label: 'Website', value: 'feruz-karimov.dev', href: 'https://feruz-karimov.dev' },
];

export const colophon = ['Hero: glass solved by optimal transport, light ray-traced', 'Set in Inter and Geist Mono'];
