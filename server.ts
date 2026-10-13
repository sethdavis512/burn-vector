import index from './index.html';

const server = Bun.serve({
  port: Number(process.env.PORT ?? 5317),
  routes: { '/': index },
  development: { hmr: true, console: true },
});

console.log(`Burn Vector running at ${server.url}`);
