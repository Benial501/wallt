import { after } from 'node:test';
import { createServer } from 'vite';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

const server = await createServer({
  root: new URL('../../', import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

after(async () => {
  await server.close();
});

export const loadModule = (path) => server.ssrLoadModule(path);

export const renderSfc = async (path, props = {}) => {
  const module = await loadModule(path);
  const app = createSSRApp({ render: () => h(module.default, props) });
  return renderToString(app);
};
