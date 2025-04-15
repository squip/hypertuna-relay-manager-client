/**
 * NostrIntegration.js
 * Integrates the existing UI with the NostrGroupClient
 * This serves as a bridge between the old App logic and the new NostrGroupClient
 * With improved filtering to reduce relay traffic
 * Enhanced to support Hypertuna relay groups
 */

import NostrGroupClient from './NostrGroupClient.js';
import { NostrUtils } from './NostrUtils.js';

class NostrIntegration {
    constructor(app) {
        this.app = app; // Reference to the existing App object
        this.client = new NostrGroupClient();
        this.relayUrls = [
            // Default relays - can be configured by the user
            'wss://relay.damus.io',
            'wss://nos.lol'
        ];
        
        // Track last update to prevent excessive updates
        this.lastGroupUpdateTime = 0;
        this.updateThrottleTime = 1000; // 1 second throttle
    }
    
    /**
     * Initialize the nostr integration
     * @param {Object} user - User object with privateKey and pubkey
     * @returns {Promise} - Resolves when initialized
     */
    async init(user) {
        // Set up event listeners
        this._setupEventListeners();
        
        // Initialize client with user and relays
        await this.client.init(user, this.relayUrls);
        
        // Update relay status in UI
        this._updateRelayStatus();
        
        return this;
    }
    
    /**
     * Set up event listeners for the client
     * @private
     */
    _setupEventListeners() {
        // Relay connection events
        this.client.on('event', ({ event }) => {
            console.log(`Received event: kind=${event.kind}, id=${event.id.substring(0, 8)}...`);
        });

        this.client.on('relay:connect', ({ relayUrl }) => {
            console.log(`Connected to relay: ${relayUrl}`);
            this._updateRelayStatus();
        });
        
        this.client.on('relay:disconnect', ({ relayUrl }) => {
            console.log(`Disconnected from relay: ${relayUrl}`);
            this._updateRelayStatus();
        });
        
        // Group events - with throttling to prevent excessive updates
        this.client.on('group:metadata', ({ groupId, group }) => {
            console.log(`Updated group metadata for: ${groupId}`);
            this._throttledGroupUpdate();
        });
        
        this.client.on('group:members', ({ groupId, members }) => {
            console.log(`Updated group members for: ${groupId}`);
            this._throttledGroupUpdate();
        });
        
        this.client.on('group:admins', ({ groupId, admins }) => {
            console.log(`Updated group admins for: ${groupId}`);
            this._throttledGroupUpdate();
        });
        
        this.client.on('group:message', ({ groupId, message }) => {
            console.log(`New message in group: ${groupId}`);
            
            // Only refresh messages if viewing this group
            if (this.app.currentPage === 'group-detail' && this.app.currentGroupId === groupId) {
                // Use setTimeout to batch updates
                setTimeout(() => {
                    this.app.loadGroupMessages();
                }, 500);
            }
        });
        
        // Profile updates
        this.client.on('profile:update', ({ pubkey, profile }) => {
            console.log(`Updated profile for: ${pubkey}`);
            // If it's the current user, update the profile display
            if (this.app.currentUser && pubkey === this.app.currentUser.pubkey) {
                this.app.updateProfileDisplay();
            }
        });
        
        // Hypertuna events
        this.client.on('hypertuna:relay', ({ hypertunaId, groupId }) => {
            console.log(`Received Hypertuna relay event for group ${groupId} with ID ${hypertunaId}`);
            this._throttledGroupUpdate();
        });
    }
    
    /**
     * Throttle group updates to prevent excessive refreshes
     * @private
     */
    _throttledGroupUpdate() {
        const now = Date.now();
        if (now - this.lastGroupUpdateTime > this.updateThrottleTime) {
            this.lastGroupUpdateTime = now;
            
            // Refresh groups list if on the groups page
            if (this.app.currentPage === 'groups') {
                this.app.loadGroups();
            }
            
            // Refresh group details if viewing a group
            if (this.app.currentPage === 'group-detail') {
                this.app.loadGroupDetails();
            }
        }
    }
    
    /**
     * Update relay status display in the UI
     * @private
     */
    _updateRelayStatus() {
        const relayStatus = document.getElementById('relay-status');
        if (!relayStatus) return;
        
        const connectedRelays = this.client.relayManager.getRelays().filter(url => 
            this.client.relayManager.getRelayStatus(url) === 'open'
        );
        
        if (connectedRelays.length > 0) {
            relayStatus.className = 'alert alert-success';
            relayStatus.innerHTML = `Connected to ${connectedRelays.length} relay(s):<br>
                ${connectedRelays.join('<br>')}`;
        } else {
            relayStatus.className = 'alert alert-error';
            relayStatus.textContent = 'Not connected to any relays';
        }
    }
    
    /**
     * Add or update relay URLs for connection
     * @param {Array} urls - Array of relay URLs
     * @returns {Promise} - Resolves when connected
     */
    async updateRelays(urls) {
        // Store the new relay URLs
        this.relayUrls = urls;
        
        // First, disconnect from any relays not in the new list
        const currentRelays = this.client.relayManager.getRelays();
        currentRelays.forEach(url => {
            if (!urls.includes(url)) {
                this.client.relayManager.removeRelay(url);
            }
        });
        
        // Connect to new relays
        const promiseArray = urls.map(url => this.client.relayManager.addRelay(url));
        await Promise.allSettled(promiseArray);
        
        this._updateRelayStatus();
    }
    
    /**
     * Connect to relays
     * @returns {Promise} - Resolves when connected
     */
    async connectRelay() {
        if (!this.app.currentUser) {
            throw new Error('User not logged in');
        }
        
        // Re-init client with current user
        await this.client.init(this.app.currentUser, this.relayUrls);
        this._updateRelayStatus();
    }
    
    /**
     * Get all available groups
     * @returns {Array} - Array of groups
     */
    getGroups() {
        return this.client.getGroups();
    }
    
    /**
     * Get a specific group by ID
     * @param {string} groupId - Group ID
     * @returns {Object|null} - Group data or null if not found
     */
    getGroupById(groupId) {
        return this.client.getGroupById(groupId);
    }
    
    /**
     * Get members of a group
     * @param {string} groupId - Group ID
     * @returns {Array} - Array of member objects
     */
    getGroupMembers(groupId) {
        return this.client.getGroupMembers(groupId);
    }
    
    /**
     * Get admins of a group
     * @param {string} groupId - Group ID
     * @returns {Array} - Array of admin objects
     */
    getGroupAdmins(groupId) {
        return this.client.getGroupAdmins(groupId);
    }
    
    /**
     * Check if a user is a member of a group
     * @param {string} groupId - Group ID
     * @param {string} pubkey - Public key
     * @returns {boolean} - Whether the user is a member
     */
    isGroupMember(groupId, pubkey) {
        return this.client.isGroupMember(groupId, pubkey);
    }
    
    /**
     * Check if a user is an admin of a group
     * @param {string} groupId - Group ID
     * @param {string} pubkey - Public key
     * @returns {boolean} - Whether the user is an admin
     */
    isGroupAdmin(groupId, pubkey) {
        return this.client.isGroupAdmin(groupId, pubkey);
    }
    
    /**
     * Get messages for a group
     * @param {string} groupId - Group ID
     * @returns {Array} - Array of message events
     */
    getGroupMessages(groupId) {
        return this.client.getGroupMessages(groupId);
    }
    
    /**
     * Create a new group
     * @param {string} name - Group name
     * @param {string} about - Group description
     * @param {boolean} isPublic - Whether the group is public
     * @param {boolean} isOpen - Whether the group is open to join
     * @returns {Promise<Object>} - Create group events collection
     */
    async createGroup(name, about, isPublic, isOpen) {
        try {
            // Validate inputs
            if (typeof name !== 'string') {
                throw new Error('Group name must be a string');
            }
            if (about !== undefined && typeof about !== 'string') {
                throw new Error('Group description must be a string');
            }
            if (isPublic !== undefined && typeof isPublic !== 'boolean') {
                throw new Error('isPublic must be a boolean');
            }
            if (isOpen !== undefined && typeof isOpen !== 'boolean') {
                throw new Error('isOpen must be a boolean');
            }
            
            console.log("NostrIntegration creating group:", { name, about, isPublic, isOpen });
            
            const eventsCollection = await this.client.createGroup({
                name,
                about,
                isPublic,
                isOpen
            });
            
            console.log('Group created successfully with the following events:');
            console.log(`- Group Create Event (kind 9007): ${eventsCollection.groupCreateEvent.id.substring(0, 8)}...`);
            console.log(`- Group Metadata Event (kind 39000): ${eventsCollection.metadataEvent.id.substring(0, 8)}...`);
            console.log(`- Hypertuna Relay Event (kind 30166): ${eventsCollection.hypertunaEvent.id.substring(0, 8)}...`);
            
            return eventsCollection;
        } catch (error) {
            console.error('Error creating group:', error);
            throw error;
        }
    }
    
    
    
    /**
     * Join a group
     * @param {string} groupId - Group ID
     * @param {string} inviteCode - Optional invite code for closed groups
     * @returns {Promise<Object>} - Join request event
     */
    async joinGroup(groupId, inviteCode = null) {
        return await this.client.joinGroup(groupId, inviteCode);
    }
    
    /**
     * Leave a group
     * @param {string} groupId - Group ID
     * @returns {Promise<Object>} - Leave request event
     */
    async leaveGroup(groupId) {
        return await this.client.leaveGroup(groupId);
    }
    
    /**
     * Send a message to a group
     * @param {string} groupId - Group ID
     * @param {string} content - Message content
     * @returns {Promise<Object>} - Message event
     */
    async sendGroupMessage(groupId, content) {
        return await this.client.sendGroupMessage(groupId, content);
    }
    
    /**
     * Create an invite code for a group
     * @param {string} groupId - Group ID
     * @returns {Promise<Object>} - Invite creation event
     */
    async createGroupInvite(groupId) {
        return await this.client.createGroupInvite(groupId);
    }
    
    /**
     * Add a member to a group or update their role
     * @param {string} groupId - Group ID
     * @param {string} pubkey - Public key of the user to add
     * @param {Array} roles - Array of roles to assign
     * @returns {Promise<Object>} - Put user event
     */
    async addGroupMember(groupId, pubkey, roles = ['member']) {
        return await this.client.addGroupMember(groupId, pubkey, roles);
    }
    
    /**
     * Remove a member from a group
     * @param {string} groupId - Group ID
     * @param {string} pubkey - Public key of the user to remove
     * @returns {Promise<Object>} - Remove user event
     */
    async removeGroupMember(groupId, pubkey) {
        return await this.client.removeGroupMember(groupId, pubkey);
    }
    
    /**
     * Update group metadata
     * @param {string} groupId - Group ID
     * @param {Object} metadata - Updated metadata
     * @returns {Promise<Object>} - Collection of metadata update events
     */
    async updateGroupMetadata(groupId, metadata) {
        try {
            const events = await this.client.updateGroupMetadata(groupId, metadata);
            
            if (events.updatedMetadataEvent) {
                console.log('Group metadata updated successfully:');
                console.log(`- Group Metadata Edit Event (kind 9002): ${events.editEvent.id.substring(0, 8)}...`);
                console.log(`- Updated Group Metadata Event (kind 39000): ${events.updatedMetadataEvent.id.substring(0, 8)}...`);
            } else {
                console.log('Group metadata updated using legacy method');
            }
            
            return events;
        } catch (error) {
            console.error('Error updating group metadata:', error);
            throw error;
        }
    }
    
    /**
     * Delete a group
     * @param {string} groupId - Group ID
     * @returns {Promise<Object>} - Delete group event
     */
    async deleteGroup(groupId) {
        return await this.client.deleteGroup(groupId);
    }
    
    /**
     * Update the updateProfile method in NostrIntegration.js
     * Replace the existing updateProfile method with this one
     */
    async updateProfile(profile) {
        try {
            // Create the profile event
            const event = await this.client.updateProfile(profile);
            
            // Retry publishing if needed
            let attempts = 0;
            const maxAttempts = 3;
            let lastError = null;
            
            while (attempts < maxAttempts) {
                try {
                    // Publish with retry logic
                    const result = await this.publishEvent(event);
                    console.log("Profile update published:", result);
                    
                    // Wait a bit to ensure all relays receive the update
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    return event;
                } catch (error) {
                    attempts++;
                    lastError = error;
                    console.warn(`Profile update attempt ${attempts} failed:`, error);
                    
                    if (attempts >= maxAttempts) {
                        break;
                    }
                    
                    // Exponential backoff for retries
                    const waitTime = Math.pow(2, attempts) * 1000; // 2s, 4s, 8s...
                    console.log(`Retrying in ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
            
            // If all retries failed, throw an error
            if (lastError) {
                throw lastError;
            } else {
                throw new Error("Failed to update profile after multiple attempts");
            }
        } catch (error) {
            console.error("Error updating profile:", error);
            throw error;
        }
    }

    /**
     * Improved publishEvent method with retry logic
     */
    async publishEvent(event) {
        // Implement retry logic for more reliable event publishing
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                const result = await this.client.relayManager.publish(event);
                return result;
            } catch (error) {
                attempts++;
                console.warn(`Publish attempt ${attempts} failed:`, error);
                
                if (attempts >= maxAttempts) {
                    throw error;
                }
                
                // Exponential backoff for retries
                const waitTime = Math.pow(2, attempts) * 500; // 1s, 2s, 4s...
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
}

export default NostrIntegration;
