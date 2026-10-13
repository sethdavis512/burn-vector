# Burn Vector

Browser space trading and combat game, a tribute to Escape Velocity (Ambrosia Software, 1996). README.md covers gameplay, controls, layout and attribution.

## Working on this repo

- Dev server: `bun run dev` (port 5317, Bun HTML imports + HMR). Every source edit triggers a full page reload, so in-memory game state resets.
- Type check: `bun run typecheck` (runs tsc under Bun, so it works whatever Node version is on PATH).
- No runtime dependencies. Flight renders on Canvas 2D; screens are plain DOM built with `h()` from `src/ui/dom.ts`; styles live in `src/style.css`.
- Keep all content original: no art, names or text from Escape Velocity. Keep the attribution on the title screen, in the handbook and in the README.
- Verify visuals with `agent-browser` (headless Chrome runs at 60 fps). The desktop app's built-in browser pane throttles requestAnimationFrame to a few fps, so it can't judge motion or performance.
- Debug handles: `window.game`, `window.PLANETS`, `window.SYSTEMS`. Fast-forward the simulation with `game.update(1 / 60)` in a loop; methods like `game.onLanded(planet)` are reachable from the console.
- Saves live in localStorage under the `bv.` prefix (`bv.pilots`, `bv.pilot.<id>`, `bv.last`, `bv.audio`, `bv.guide`); `src/core/storage.ts` migrates keys from the old `ev.` prefix. Give new `PlayerState` fields defaults in `normalizePlayer()` so old saves keep loading.
- Sound defaults to off (a user requirement). The speaker button and the `V` key toggle it on every screen.
- The game must always tell the player what to do next and how (a user requirement). `src/game/guide.ts` builds the current objective for the flight panel and the spaceport "Next step" card; the handbook lives in `src/ui/help.ts` (a native `<dialog>`, opened by the `?` button, `?` or `F1`). When adding a mechanic, add its how-to to the handbook and, if it changes what players should do next, to the guide.

## Bun

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
