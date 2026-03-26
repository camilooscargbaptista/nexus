/**
 * Jest setup — polyfill para Node 18 compatibility
 * Node 18 não expõe `crypto` como global, mas Node 20+ sim.
 */
const { webcrypto } = require('node:crypto');

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}
