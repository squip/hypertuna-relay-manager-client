/**
 * NostrUtils.js
 * Core utilities for nostr operations
 * Using nobleSecp256k1 for cryptography
 */

// Import from local module if available, otherwise try window object
import { nobleSecp256k1, browserifyCipher } from './crypto-libraries.js';

export class NostrUtils {
    /**
     * Convert hex string to Uint8Array
     * @param {string} hex - Hex string
     * @returns {Uint8Array}
     */
    static hexToBytes(hex) {
        return new Uint8Array(
            hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
        );
    }
    
    /**
     * Convert Uint8Array to hex string
     * @param {Uint8Array} bytes - Bytes to convert
     * @returns {string} - Hex string
     */
    static bytesToHex(bytes) {
        return Array.from(bytes)
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }
    
    /**
     * Generate a new private key
     * @returns {string} - Hex-encoded private key
     */
    static generatePrivateKey() {
        // Access nobleSecp256k1 from either the import or window global
        const secp = nobleSecp256k1 || window.nobleSecp256k1;
        if (!secp) {
            throw new Error('Noble Secp256k1 library not available');
        }
        return this.bytesToHex(secp.utils.randomPrivateKey());
    }
    
    /**
     * Get public key from private key
     * @param {string} privateKey - Hex-encoded private key
     * @returns {string} - Hex-encoded public key
     */
    static getPublicKey(privateKey) {
        // Access nobleSecp256k1 from either the import or window global
        const secp = nobleSecp256k1 || window.nobleSecp256k1;
        if (!secp) {
            throw new Error('Noble Secp256k1 library not available');
        }
        return secp.getPublicKey(privateKey, true).substring(2);
    }
    
    /**
     * Sign an event with a private key
     * @param {Object} event - Unsigned event
     * @param {string} privateKey - Private key
     * @returns {Promise<Object>} - Signed event
     */
    static async signEvent(event, privateKey) {
        // Access nobleSecp256k1 from either the import or window global
        const secp = nobleSecp256k1 || window.nobleSecp256k1;
        if (!secp) {
            throw new Error('Noble Secp256k1 library not available');
        }
        
        // Prepare the event for signing
        const eventData = JSON.stringify([
            0,
            event.pubkey,
            event.created_at,
            event.kind,
            event.tags,
            event.content
        ]);
        
        // Generate the event ID
        event.id = this.bytesToHex(
            await secp.utils.sha256(
                new TextEncoder().encode(eventData)
            )
        );
        
        // Sign the event
        event.sig = await secp.schnorr.sign(event.id, privateKey);
        
        return event;
    }
    
    /**
     * Verify an event signature
     * @param {Object} event - Signed event
     * @returns {Promise<boolean>} - Whether the signature is valid
     */
    static async verifySignature(event) {
        try {
            // Access nobleSecp256k1 from either the import or window global
            const secp = nobleSecp256k1 || window.nobleSecp256k1;
            if (!secp) {
                throw new Error('Noble Secp256k1 library not available');
            }
            
            // Recreate the event ID
            const eventData = JSON.stringify([
                0,
                event.pubkey,
                event.created_at,
                event.kind,
                event.tags,
                event.content
            ]);
            
            const id = this.bytesToHex(
                await secp.utils.sha256(
                    new TextEncoder().encode(eventData)
                )
            );
            
            // Check if the ID matches
            if (id !== event.id) {
                return false;
            }
            
            // Verify the signature
            return await secp.schnorr.verify(
                event.sig,
                event.id,
                '02' + event.pubkey
            );
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }
    
    /**
     * Encrypt message for DMs (kind 4)
     * @param {string} privkey - Sender's private key
     * @param {string} pubkey - Recipient's public key
     * @param {string} text - Plain text message
     * @returns {string} - Encrypted message with IV
     */
    static encrypt(privkey, pubkey, text) {
        // Access libraries from either the import or window globals
        const secp = nobleSecp256k1 || window.nobleSecp256k1;
        const cipher = browserifyCipher || window.browserifyCipher;
        
        if (!secp || !cipher) {
            throw new Error('Encryption libraries not available');
        }
        
        var key = secp.getSharedSecret(privkey, '02' + pubkey, true).substring(2);
        var iv = window.crypto.getRandomValues(new Uint8Array(16));
        var cipherObj = cipher.createCipheriv('aes-256-cbc', this.hexToBytes(key), iv);
        var encryptedMessage = cipherObj.update(text, "utf8", "base64");
        var emsg = encryptedMessage + cipherObj.final("base64");
        var uint8View = new Uint8Array(iv.buffer);
        var decoder = new TextDecoder();
        return emsg + "?iv=" + btoa(String.fromCharCode.apply(null, uint8View));
    }
    
    /**
     * Decrypt message for DMs (kind 4)
     * @param {string} privkey - Recipient's private key
     * @param {string} pubkey - Sender's public key
     * @param {string} ciphertext - Encrypted message with IV
     * @returns {string} - Decrypted message
     */
    static decrypt(privkey, pubkey, ciphertext) {
        // Access libraries from either the import or window globals
        const secp = nobleSecp256k1 || window.nobleSecp256k1;
        const cipher = browserifyCipher || window.browserifyCipher;
        
        if (!secp || !cipher) {
            throw new Error('Encryption libraries not available');
        }
        
        var [emsg, iv] = ciphertext.split("?iv=");
        var key = secp.getSharedSecret(privkey, '02' + pubkey, true).substring(2);
        var decipher = cipher.createDecipheriv(
            'aes-256-cbc',
            this.hexToBytes(key),
            this.hexToBytes(this.base64ToHex(iv))
        );
        var decryptedMessage = decipher.update(emsg, "base64");
        var dmsg = decryptedMessage + decipher.final("utf8");
        return dmsg;
    }
    
    /**
     * Convert base64 to hex
     * @param {string} str - Base64 string
     * @returns {string} - Hex string
     */
    static base64ToHex(str) {
        var raw = atob(str);
        var result = '';
        for (var i = 0; i < raw.length; i++) {
            var hex = raw.charCodeAt(i).toString(16);
            result += (hex.length === 2 ? hex : '0' + hex);
        }
        return result;
    }
    
    /**
     * Format timestamp to human-readable time
     * @param {number} timestamp - Unix timestamp
     * @returns {string} - Formatted time string
     */
    static formatTime(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    }
    
    /**
     * Truncate pubkey for display
     * @param {string} pubkey - Public key
     * @returns {string} - Truncated public key
     */
    static truncatePubkey(pubkey) {
        if (!pubkey) return '';
        return pubkey.substring(0, 6) + '...' + pubkey.substring(pubkey.length - 4);
    }
    
    /**
     * Generate a random ID (for group IDs, etc.)
     * @returns {string} - Random ID
     */
    static generateRandomId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    /**
     * Generate a random invite code
     * @returns {string} - Invite code
     */
    static generateInviteCode() {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 10; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    /**
     * Get previous event references for timeline threading
     * @param {Array} events - Array of events
     * @param {string} currentPubkey - Current user's pubkey
     * @returns {Array} - Array of event IDs to reference
     */
    static getPreviousEventRefs(events, currentPubkey) {
        // Get last 50 events excluding the current user's events
        const filteredEvents = events
            .filter(e => e.pubkey !== currentPubkey)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, 50);
        
        // Take 3 random events from those or all if less than 3
        const numRefs = Math.min(3, filteredEvents.length);
        const refs = [];
        
        // If we have less than 3 events, use all of them
        if (filteredEvents.length <= 3) {
            refs.push(...filteredEvents.map(e => e.id.substring(0, 8)));
        } else {
            // Otherwise pick 3 random ones
            const indices = new Set();
            while (indices.size < numRefs) {
                indices.add(Math.floor(Math.random() * filteredEvents.length));
            }
            
            indices.forEach(index => {
                refs.push(filteredEvents[index].id.substring(0, 8));
            });
        }
        
        return refs;
    }
}
