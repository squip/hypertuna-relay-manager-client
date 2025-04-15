/**
 * main.js
 * Main entry point for the Nostr Groups app
 * Loads all modules and initializes the application
 */

// Import required modules
import { NostrUtils } from './NostrUtils.js';
import NostrEvents from './NostrEvents.js';
import WebSocketRelayManager from './WebSocketRelayManager.js';
import NostrGroupClient from './NostrGroupClient.js';
import NostrIntegration from './NostrIntegration.js';
import integrateNostrRelays from './AppIntegration.js';

// Define default relays
const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol'
];

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Nostr Groups app...');
    
    // Access the App object through the window
    // In the index.html file, the App is defined in the inline script
    if (typeof window.App !== 'undefined') {
        const App = window.App;
        App.init();
        
        // Then integrate with real nostr relays
        integrateNostrRelays(App);
        
        // Initialize with default relays if user is already logged in
        if (App.currentUser && App.currentUser.privateKey) {
            if (App.nostr) {
                // Set default relays in the UI
                const relayUrlsInput = document.getElementById('relay-urls');
                if (relayUrlsInput) {
                    relayUrlsInput.value = DEFAULT_RELAYS.join('\n');
                }
                
                const profileRelayUrlsInput = document.getElementById('profile-relay-urls');
                if (profileRelayUrlsInput) {
                    profileRelayUrlsInput.value = DEFAULT_RELAYS.join('\n');
                }
                
                // Connect to default relays
                App.nostr.updateRelays(DEFAULT_RELAYS)
                    .then(() => console.log('Connected to default relays'))
                    .catch(error => console.error('Error connecting to default relays:', error));
            }
        }
        
        console.log('Nostr Groups app initialized');
    } else {
        console.error('App object not found. Make sure app.js is loaded first.');
        console.log('Checking for App in the global scope...');
        
        // Try to find App in window object (in case it was defined in a different way)
        for (let prop in window) {
            if (window[prop] && typeof window[prop] === 'object' && window[prop].init && window[prop].loadGroups) {
                console.log('Found App-like object at window.' + prop);
                const AppCandidate = window[prop];
                AppCandidate.init();
                integrateNostrRelays(AppCandidate);
                console.log('Initialized with candidate App object');
                break;
            }
        }
    }
});

// Export the modules for use in the app
export {
    NostrUtils,
    NostrEvents,
    WebSocketRelayManager,
    NostrGroupClient,
    NostrIntegration,
    integrateNostrRelays
};
