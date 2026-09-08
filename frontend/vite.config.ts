import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import { defineConfig } from 'vite'

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// The compiled Compact contracts and their witnesses live above this package,
// so the app can run the REAL contract logic in the browser rather than a
// hand-written stand-in. `compact-runtime` reaches wasm-bindgen's bundler
// target (a bare `import ... from './*.wasm'`), which Vite only understands
// through vite-plugin-wasm. That plugin emits top-level await, so every build
// target here has to be one that supports it.
export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so the base path has to
  // be baked in at build time. CI sets it; local dev and any root-served host
  // keep "/". The router reads the same value through import.meta.env.BASE_URL.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [wasm(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@compiled': root('../compiled'),
      '@contracts': root('../contracts'),
      // The compiled contracts and witnesses live above this package, so they
      // would resolve the runtime from the ROOT node_modules while app code
      // resolves this package's own copy — two different wasm runtimes in one
      // bundle. Pin both to THIS package's copy, so `cd frontend && npm
      // install && npm run dev` works on a fresh clone with no root install.
      // package.json pins onchain-runtime-v3 to the version the Node client and
      // the unit tests use, so the two halves still run the same runtime.
      '@midnight-ntwrk/compact-runtime': root('./node_modules/@midnight-ntwrk/compact-runtime'),
      '@midnight-ntwrk/onchain-runtime-v3': root(
        './node_modules/@midnight-ntwrk/onchain-runtime-v3',
      ),
    },
    dedupe: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime-v3'],
  },
  server: {
    port: 3000,
    fs: { allow: [root('.'), root('..')] },
  },
  build: {
    target: 'esnext',
    // CSS minification is off on purpose. Vite's minifier (Lightning CSS)
    // merges animation longhands into the `animation` shorthand, and
    // `animation-timeline` is not a legal component of that shorthand, so
    //   animation: k-lap linear both; animation-timeline: --k-track;
    // became `animation: linear both k-lap --k-track` — which the browser
    // rejects wholesale. Every scroll-driven animation on the landing page was
    // silently dead in production while dev (unminified) looked perfect.
    // Splitting the declarations across two rules does not help: it merges
    // rules with identical selectors too. esbuild would not do this, but Vite 8
    // runs on rolldown and ships no esbuild to switch to. The CSS is ~7 kB
    // gzipped either way, so correctness is worth more than the bytes here.
    cssMinify: false,
  },
  optimizeDeps: {
    // Only the wasm-bindgen package must stay unbundled — the dependency
    // optimizer cannot follow its bare .wasm import. compact-runtime itself
    // has to be optimized, or its CommonJS dep (object-inspect) reaches the
    // browser without interop and fails on a missing default export.
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
    include: ['@midnight-ntwrk/compact-runtime', 'object-inspect'],
  },
})
