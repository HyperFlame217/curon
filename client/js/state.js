/**
 * CURON.EXE — Global Data Registry
 * Central state and configuration for the two-user ecosystem.
 */

window.CONFIG = {
  THEMES: [],
  FURNITURE: [],
  ROOMS: [],
  CATS: [],
  OUTFITS: [],
  isLoaded: false
};

window.STATE = {
  token: localStorage.getItem('curon_token'),
  user: JSON.parse(localStorage.getItem('curon_user') || 'null'),
  ws: null,
  otherId: null,
  otherName: null,
  reconnTimer: null,
  typingTimer: null,
  wasDisconnected: false, // For reconnection sync
  // Crypto
  privateKey: null,   // RSA-OAEP CryptoKey (in memory only)
  publicKey: null,    // own RSA-OAEP public CryptoKey
  otherPubKey: null,  // other user's RSA-OAEP public CryptoKey
  password: null,     // held briefly during key setup, then cleared
  userAId: null       // first seeded user — determines slot A vs B
};
