/**
 * main.js
 * Main entry point for the Nostr Groups app
 * Loads all modules and initializes the application
 */

// Import crypto libraries first to ensure they're available
import './crypto-libraries.js';

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
    
    // Set up App in the global context if it's not already defined
    if (typeof window.App === 'undefined') {
        console.log('Creating App in window context...');
        // Initialize the App with all required methods
        // This code moves the App definition from inline script to this module
        window.App = {
            currentPage: 'auth',
            currentUser: null,
            currentGroup: null,
            currentGroupId: null,
            relay: null,
            
            init() {
                this.setupEventListeners();
                this.loadUserFromLocalStorage();
                this.updateUIState();
            },
            
            // Add all the methods from the original App object here
            // For brevity, I'm not including all methods, but you should copy them from index.html
            loadUserFromLocalStorage() {
                const savedUser = localStorage.getItem('nostr_user');
                if (savedUser) {
                    try {
                        this.currentUser = JSON.parse(savedUser);
                        this.updateProfileDisplay();
                    } catch (e) {
                        console.error('Error loading user data:', e);
                        localStorage.removeItem('nostr_user');
                    }
                }
            },
            
            saveUserToLocalStorage() {
                if (this.currentUser) {
                    localStorage.setItem('nostr_user', JSON.stringify(this.currentUser));
                } else {
                    localStorage.removeItem('nostr_user');
                }
            },
            
            // Add placeholder methods that will be replaced by integration
            setupEventListeners() {},
            updateUIState() {},
            updateProfileDisplay() {},
            navigateTo() {},
            switchTab() {},
            login() {},
            logout() {},
            connectRelay() {}
            // Add other methods as needed
        };
    }
    
    // Access the App object
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
