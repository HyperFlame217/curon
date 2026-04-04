/**
 * CURON.EXE — Web Crypto API Service
 * Implements end-to-end encryption with RSA-OAEP and AES-GCM.
 */

window.bufToB64 = function(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
};

window.b64ToBuf = function(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
};

// Derive a wrapping key from password + username (PBKDF2 → AES-GCM)
window.deriveWrappingKey = async function(password, username) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(username), iterations: 310000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
};

// Generate a new RSA-OAEP keypair
window.generateKeyPair = async function() {
  return crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
};

// Export public key as base64 string
window.exportPublicKey = async function(pubKey) {
  const buf = await crypto.subtle.exportKey('spki', pubKey);
  return bufToB64(buf);
};

// Import public key from base64 string
window.importPublicKey = async function(b64) {
  const buf = b64ToBuf(b64);
  return crypto.subtle.importKey('spki', buf, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
};

// Wrap private key with AES wrapping key → base64
window.wrapPrivateKey = async function(privateKey, wrappingKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.wrapKey('pkcs8', privateKey, wrappingKey, { name: 'AES-GCM', iv });
  return bufToB64(iv) + ':' + bufToB64(buf);
};

// Unwrap private key from base64 → CryptoKey
window.unwrapPrivateKey = async function(wrapped, wrappingKey) {
  const [ivB64, keyB64] = wrapped.split(':');
  const iv = b64ToBuf(ivB64);
  const buf = b64ToBuf(keyB64);
  return crypto.subtle.unwrapKey(
    'pkcs8', buf, wrappingKey,
    { name: 'AES-GCM', iv },
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true, ['decrypt']
  );
};

// Encrypt a message for both users.
window.encryptMessage = async function(plaintext, pubKeyA, pubKeyB) {
  const enc = new TextEncoder();
  const sessionKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherContent = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, enc.encode(plaintext));
  const rawKey = await crypto.subtle.exportKey('raw', sessionKey);
  const encKeyA = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKeyA, rawKey);
  const encKeyB = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKeyB, rawKey);

  return {
    encrypted_content_a: bufToB64(cipherContent),
    encrypted_content_b: bufToB64(cipherContent),
    encrypted_key_a: bufToB64(encKeyA),
    encrypted_key_b: bufToB64(encKeyB),
    iv: bufToB64(iv),
  };
};

// Decrypt a message using my private key
window.decryptMessage = async function(bundle, privateKey) {
  const rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, b64ToBuf(bundle.encrypted_key));
  const sessionKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(bundle.iv) }, sessionKey, b64ToBuf(bundle.encrypted_content));
  return new TextDecoder().decode(plain);
};
