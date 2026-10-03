/**
 * Browser stand-in for `isomorphic-ws`, aliased in vite.config.ts.
 *
 * midnight-js's indexer provider does `import * as ws from 'isomorphic-ws'`
 * and defaults to `ws.WebSocket`, but the package's browser build only has a
 * default export, so the named import is undefined in a bundle. This module
 * offers both, backed by the browser's own WebSocket.
 */
const Impl: typeof WebSocket = globalThis.WebSocket;
export { Impl as WebSocket };
export default Impl;
