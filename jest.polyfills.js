// Polyfills that must exist before the test environment and modules load.
//
// jsdom (via jest-environment-jsdom / jest-fixed-jsdom) provides a `crypto`
// global that lacks `randomUUID`, which application code relies on. Node's Web
// Crypto implementation has it, so we backfill any missing members from there.
const nodeCrypto = require('node:crypto');

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = nodeCrypto.webcrypto;
} else if (typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = nodeCrypto.randomUUID.bind(nodeCrypto);
}
