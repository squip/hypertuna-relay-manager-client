/**
 * crypto-libraries.js
 * Load cryptographic libraries for Nostr operations
 */

// Import the libraries directly
import * as secp256k1 from 'noble-secp256k1';
import * as cipher from 'browserify-cipher';

// Assign them to the window object for compatibility with existing code
window.nobleSecp256k1 = secp256k1;
window.browserifyCipher = cipher;

// Export the libraries for module imports
export { secp256k1 as nobleSecp256k1, cipher as browserifyCipher };

// Log that libraries were loaded successfully
console.log('Crypto libraries loaded successfully:');
console.log('Noble Secp256k1 loaded:', !!window.nobleSecp256k1);
console.log('Browserify Cipher loaded:', !!window.browserifyCipher);
