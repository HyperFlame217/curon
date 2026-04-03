/**
 * The server never decrypts message content.
 * All E2E encryption/decryption happens on the client using the Web Crypto API.
 *
 * This file provides:
 *   - Shape validation before storing cipher bundles
 *   - Any future server-side crypto needs (e.g. media tokens)
 */

function isValidCipherBundle(obj) {
  return (
    obj &&
    typeof obj.encrypted_content_a === 'string' && obj.encrypted_content_a.length > 0 &&
    typeof obj.encrypted_content_b === 'string' && obj.encrypted_content_b.length > 0 &&
    typeof obj.encrypted_key_a     === 'string' && obj.encrypted_key_a.length     > 0 &&
    typeof obj.encrypted_key_b     === 'string' && obj.encrypted_key_b.length     > 0 &&
    typeof obj.iv                  === 'string' && obj.iv.length                  > 0
  );
}

module.exports = { isValidCipherBundle };
