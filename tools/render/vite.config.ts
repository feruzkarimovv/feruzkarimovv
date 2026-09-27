import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The renderer lives in the website repo. Point EH_SRC somewhere else if it moves.
const eh = path.resolve(process.env.EH_SRC || path.join(here, '../../../23-web/src'));

export default {
  root: here,
  resolve: { alias: { '@eh': eh } },
  server: { port: 5199, strictPort: true, fs: { allow: [here, path.dirname(eh)] } },
  logLevel: 'warn',
};
