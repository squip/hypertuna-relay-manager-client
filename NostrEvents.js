/**
 * NostrEvents.js
 * Utility class for creating, signing, and verifying nostr events
 * Focuses on NIP-29 (Groups) event kinds
 */

import { NostrUtils } from './NostrUtils.js';

class NostrEvents {
    /**
     * Event Kinds
     * Standard kinds (1-9999)
     * - 0: Metadata (profile info)
     * - 1: Text Note (standard message)
     * - 4: Encrypted Direct Message
     * 
     * NIP-29 Events
     * - 9000: Group Put User (add a user to a group or update their role)
     * - 9001: Group Remove User (remove a user from a group)
     * - 9002: Group Edit Metadata (edit group metadata)
     * - 9007: Group Create (create a new group)
     * - 9008: Group Delete (delete a group)
     * - 9009: Group Invite Create (create an invite code)
     * - 9021: Group Join Request (request to join a group)
     * - 9022: Group Leave Request (request to leave a group)
     * 
     * NIP-29 Relay Maintained Events
     * - 39000: Group Metadata (maintained by relay)
     * - 39001: Group Admin List (maintained by relay)
     * - 39002: Group Member List (maintained by relay)
     * - 39003: Group Roles List (maintained by relay)
     * 
     * Custom Hypertuna Events
     * - 30166: Hypertuna Relay Event
     */
    
    // Standard event kinds
    static KIND_METADATA = 0;
    static KIND_TEXT_NOTE = 1;
    static KIND_ENCRYPTED_DM = 4;
    
    // NIP-29 event kinds
    static KIND_GROUP_PUT_USER = 9000;
    static KIND_GROUP_REMOVE_USER = 9001;
    static KIND_GROUP_EDIT_METADATA = 9002;
    static KIND_GROUP_CREATE = 9007;
    static KIND_GROUP_DELETE = 9008;
    static KIND_GROUP_INVITE_CREATE = 9009;
    static KIND_GROUP_JOIN_REQUEST = 9021;
    static KIND_GROUP_LEAVE_REQUEST = 9022;
    
    // NIP-29 relay events
    static KIND_GROUP_METADATA = 39000;
    static KIND_GROUP_ADMIN_LIST = 39001;
    static KIND_GROUP_MEMBER_LIST = 39002;
    static KIND_GROUP_ROLES_LIST = 39003;
    
    // Hypertuna custom events
    static KIND_HYPERTUNA_RELAY = 30166;
    
    /**
     * Create and sign a generic event with enhanced logging
     * @param {number} kind - Event kind
     * @param {string} content - Event content
     * @param {Array} tags - Event tags
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createEvent(kind, content, tags, privateKey) {
        console.log(`Creating event kind ${kind} with ${tags ? tags.length : 0} tags`);
        
        const pubkey = NostrUtils.getPublicKey(privateKey);
        
        const event = {
            kind,
            content,
            tags: tags || [],
            created_at: Math.floor(Date.now() / 1000),
            pubkey
        };
        
        console.log(`Event created (unsigned):`, {
            kind: event.kind,
            created_at: event.created_at,
            pubkey: event.pubkey.substring(0, 8) + '...',
            tags: event.tags,
            content_length: content.length
        });
        
        const signedEvent = await NostrUtils.signEvent(event, privateKey);
        
        console.log(`Event signed with ID: ${signedEvent.id.substring(0, 8)}...`);
        
        return signedEvent;
    }
    
    /**
     * Create a profile metadata event (kind 0)
     * @param {Object} profile - Profile data {name, about, picture, etc}
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createProfileEvent(profile, privateKey) {
        console.log('Creating profile event with data:', {
            name: profile.name,
            about: profile.about ? profile.about.substring(0, 30) + '...' : undefined,
            picture: profile.picture ? 'present' : undefined
        });
        
        return this.createEvent(
            this.KIND_METADATA,
            JSON.stringify(profile),
            [],
            privateKey
        );
    }
    
    
    /**
     * Create a text note (kind 1)
     * @param {string} content - Message content
     * @param {Array} tags - Event tags
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createTextNote(content, tags, privateKey) {
        return this.createEvent(
            this.KIND_TEXT_NOTE,
            content,
            tags,
            privateKey
        );
    }
    
    /**
     * Create a group message with enhanced logging
     * @param {string} groupId - Group ID
     * @param {string} content - Message content
     * @param {Array} previousEvents - Optional array of previous event IDs for threading
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createGroupMessage(groupId, content, previousEvents, privateKey) {
        console.log(`Creating group message for group ${groupId.substring(0, 8)}...`);
        console.log(`Message content length: ${content.length}`);
        
        const tags = [
            ['h', groupId] // Tag 'h' with the group ID as per NIP-29
        ];
        
        // Add previous events for threading if provided
        if (Array.isArray(previousEvents) && previousEvents.length > 0) {
            console.log(`Adding ${previousEvents.length} previous event references`);
            previousEvents.forEach(eventId => {
                if (eventId) {
                    tags.push(['previous', eventId]);
                }
            });
        }
        
        return this.createTextNote(content, tags, privateKey);
    }
    
    /**
     * Create a group creation event with enhanced logging and companion events
     * @param {string} name - Group name
     * @param {string} about - Group description
     * @param {boolean} isPublic - Whether group is public
     * @param {boolean} isOpen - Whether group is open (anyone can join)
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Collection of events for group creation
     */
    static async createGroupCreationEvent(name, about, isPublic, isOpen, privateKey) {
        const groupId = NostrUtils.generateRandomId();
        const hypertunaId = NostrUtils.generateRandomId();
        
        console.log(`Creating group with ID: ${groupId}`);
        console.log(`Using hypertuna ID: ${hypertunaId}`);
        console.log(`Group settings: name="${name}", public=${isPublic}, open=${isOpen}`);
        
        // Base tags for the group creation event (kind 9007)
        const groupTags = [
            ['h', groupId],
            ['name', String(name)], // Ensure name is a string
            ['about', about ? String(about) : ''], // Ensure about is a string, defaulting to empty if null/undefined
            ['hypertuna', hypertunaId],
            ['i', 'hypertuna:relay']
        ];
        
        if (isPublic) {
            groupTags.push(['public']);
        } else {
            groupTags.push(['private']);
        }
        
        if (isOpen) {
            groupTags.push(['open']);
        } else {
            groupTags.push(['closed']);
        }
        
        // Create the kind 9007 group creation event
        const groupCreateEvent = await this.createEvent(
            this.KIND_GROUP_CREATE,
            `Created group: ${name}`,
            groupTags,
            privateKey
        );
        
        // Create the kind 39000 group metadata event (with 'd' tag instead of 'h')
        const metadataTags = [
            ['d', groupId],
            ['name', String(name)], // Ensure name is a string
            ['about', about ? String(about) : ''], // Ensure about is a string
            ['hypertuna', hypertunaId],
            ['i', 'hypertuna:relay']
        ];
        
        if (isPublic) {
            metadataTags.push(['public']);
        } else {
            metadataTags.push(['private']);
        }
        
        if (isOpen) {
            metadataTags.push(['open']);
        } else {
            metadataTags.push(['closed']);
        }
        
        const metadataEvent = await this.createEvent(
            this.KIND_GROUP_METADATA,
            `Group metadata for: ${name}`,
            metadataTags,
            privateKey
        );
        
        // Create the kind 30166 Hypertuna relay event
        const hypertunaRelayTags = [
            ['d', NostrUtils.generateRandomId()],
            ['hypertuna', hypertunaId],
            ['h', groupId],
            ['i', 'hypertuna:relay']
        ];
        
        const hypertunaEvent = await this.createEvent(
            this.KIND_HYPERTUNA_RELAY,
            `Hypertuna relay for group: ${name}`,
            hypertunaRelayTags,
            privateKey
        );
        
        return {
            groupCreateEvent,
            metadataEvent,
            hypertunaEvent,
            groupId,
            hypertunaId
        };
    }
    
    /**
     * Create a group metadata edit event (kind 9002) and updates to kind 39000
     * @param {string} groupId - Group ID
     * @param {string} hypertunaId - Hypertuna ID for the group
     * @param {Object} metadata - Group metadata
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Metadata edit event and updated metadata event
     */
    static async createGroupMetadataEditEvents(groupId, hypertunaId, metadata, privateKey) {
        console.log(`Creating group metadata edit events for group ${groupId}`);
        console.log(`Using hypertuna ID: ${hypertunaId}`);
        console.log(`Updated metadata:`, metadata);
        
        // Create the kind 9002 edit metadata event
        const editTags = [
            ['h', groupId],
            ['hypertuna', hypertunaId],
            ['i', 'hypertuna:relay']  // Added identifier tag
        ];
        
        if (metadata.name) {
            editTags.push(['name', metadata.name]);
        }
        
        if (metadata.about) {
            editTags.push(['about', metadata.about]);
        }
        
        if (metadata.isPublic !== undefined) {
            editTags.push([metadata.isPublic ? 'public' : 'private']);
        }
        
        if (metadata.isOpen !== undefined) {
            editTags.push([metadata.isOpen ? 'open' : 'closed']);
        }
        
        const editEvent = await this.createEvent(
            this.KIND_GROUP_EDIT_METADATA,
            'Updating group metadata',
            editTags,
            privateKey
        );
        
        // Create updated kind 39000 group metadata event
        const metadataTags = [
            ['d', groupId],
            ['hypertuna', hypertunaId],
            ['i', 'hypertuna:relay']  // Added identifier tag
        ];
        
        if (metadata.name) {
            metadataTags.push(['name', metadata.name]);
        }
        
        if (metadata.about) {
            metadataTags.push(['about', metadata.about]);
        }
        
        if (metadata.isPublic !== undefined) {
            metadataTags.push([metadata.isPublic ? 'public' : 'private']);
        } else {
            // Preserve existing public/private status
            metadataTags.push(['public']);  // Default to public if not specified
        }
        
        if (metadata.isOpen !== undefined) {
            metadataTags.push([metadata.isOpen ? 'open' : 'closed']);
        } else {
            // Preserve existing open/closed status
            metadataTags.push(['open']);  // Default to open if not specified
        }
        
        const updatedMetadataEvent = await this.createEvent(
            this.KIND_GROUP_METADATA,
            `Updated metadata for group: ${metadata.name || 'Unnamed Group'}`,
            metadataTags,
            privateKey
        );
        
        return {
            editEvent,
            updatedMetadataEvent
        };
    }
    
    /**
     * Create a join request event (kind 9021)
     * @param {string} groupId - Group ID
     * @param {string} inviteCode - Optional invite code for closed groups
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createGroupJoinRequest(groupId, inviteCode, privateKey) {
        const tags = [
            ['h', groupId]
        ];
        
        if (inviteCode) {
            tags.push(['code', inviteCode]);
        }
        
        return this.createEvent(
            this.KIND_GROUP_JOIN_REQUEST,
            'Request to join the group',
            tags,
            privateKey
        );
    }
    
    /**
     * Create a leave request event (kind 9022)
     * @param {string} groupId - Group ID
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createGroupLeaveRequest(groupId, privateKey) {
        return this.createEvent(
            this.KIND_GROUP_LEAVE_REQUEST,
            'Request to leave the group',
            [['h', groupId]],
            privateKey
        );
    }
    
    /**
     * Create a put user event (kind 9000)
     * @param {string} groupId - Group ID
     * @param {string} pubkey - Public key of user to add/update
     * @param {Array} roles - Array of roles for the user
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createPutUserEvent(groupId, pubkey, roles, privateKey) {
        const tags = [
            ['h', groupId],
            ['p', pubkey, ...(roles || ['member'])]
        ];
        
        return this.createEvent(
            this.KIND_GROUP_PUT_USER,
            `Adding user with roles: ${(roles || ['member']).join(', ')}`,
            tags,
            privateKey
        );
    }
    
    /**
     * Create a remove user event (kind 9001)
     * @param {string} groupId - Group ID
     * @param {string} pubkey - Public key of user to remove
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createRemoveUserEvent(groupId, pubkey, privateKey) {
        const tags = [
            ['h', groupId],
            ['p', pubkey]
        ];
        
        return this.createEvent(
            this.KIND_GROUP_REMOVE_USER,
            'Removing user from group',
            tags,
            privateKey
        );
    }
    
    /**
     * Create a group invite event (kind 9009)
     * @param {string} groupId - Group ID
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createGroupInviteEvent(groupId, privateKey) {
        return this.createEvent(
            this.KIND_GROUP_INVITE_CREATE,
            'Creating invite code',
            [['h', groupId]],
            privateKey
        );
    }
    
    /**
     * Create a group metadata edit event (kind 9002)
     * @param {string} groupId - Group ID
     * @param {Object} metadata - Group metadata
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     * @deprecated Use createGroupMetadataEditEvents instead
     */
    static async createGroupMetadataEditEvent(groupId, metadata, privateKey) {
        const tags = [
            ['h', groupId]
        ];
        
        if (metadata.name) {
            tags.push(['name', metadata.name]);
        }
        
        if (metadata.about) {
            tags.push(['about', metadata.about]);
        }
        
        if (metadata.isPublic !== undefined) {
            tags.push([metadata.isPublic ? 'public' : 'private']);
        }
        
        if (metadata.isOpen !== undefined) {
            tags.push([metadata.isOpen ? 'open' : 'closed']);
        }
        
        return this.createEvent(
            this.KIND_GROUP_EDIT_METADATA,
            'Updating group metadata',
            tags,
            privateKey
        );
    }
    
    /**
     * Create a group delete event (kind 9008)
     * @param {string} groupId - Group ID
     * @param {string} privateKey - Private key for signing
     * @returns {Promise<Object>} - Signed event
     */
    static async createGroupDeleteEvent(groupId, privateKey) {
        return this.createEvent(
            this.KIND_GROUP_DELETE,
            'Deleting group',
            [['h', groupId]],
            privateKey
        );
    }
    
    /**
     * Parse group metadata from event
     * @param {Object} event - Group metadata event (kind 39000)
     * @returns {Object} - Parsed group data
     */
    static parseGroupMetadata(event) {
        if (!event || event.kind !== this.KIND_GROUP_METADATA) {
            console.warn(`Not a valid group metadata event. Kind: ${event?.kind}`);
            return null;
        }
        
        const groupId = this._getTagValue(event, 'd');
        if (!groupId) {
            console.warn('Group metadata event missing d tag');
            return null;
        }
        
        // Extract hypertunaId and check for identifier tag
        const hypertunaId = this._getTagValue(event, 'hypertuna');
        const hasIdentifierTag = event.tags.some(tag => tag[0] === 'i' && tag[1] === 'hypertuna:relay');
        
        console.log(`Parsing group metadata: id=${groupId}, hypertunaId=${hypertunaId}, hasIdentifierTag=${hasIdentifierTag}`);
        
        return {
            id: groupId,
            name: this._getTagValue(event, 'name') || 'Unnamed Group',
            about: this._getTagValue(event, 'about') || '',
            isPublic: this._hasTag(event, 'public'),
            isOpen: this._hasTag(event, 'open'),
            createdAt: event.created_at,
            relay: event.pubkey,
            event: event,
            hypertunaId: hypertunaId,
            isHypertunaRelay: hasIdentifierTag
        };
    }
    
    /**
     * Parse group members from event
     * @param {Object} event - Group members event (kind 39002)
     * @returns {Array} - Array of member objects
     */
    static parseGroupMembers(event) {
        if (!event || event.kind !== this.KIND_GROUP_MEMBER_LIST) {
            return [];
        }
        
        return event.tags
            .filter(tag => tag[0] === 'p')
            .map(tag => ({
                pubkey: tag[1],
                roles: tag.slice(2)
            }));
    }
    
    /**
     * Parse group admins from event
     * @param {Object} event - Group admins event (kind 39001)
     * @returns {Array} - Array of admin objects
     */
    static parseGroupAdmins(event) {
        if (!event || event.kind !== this.KIND_GROUP_ADMIN_LIST) {
            return [];
        }
        
        return event.tags
            .filter(tag => tag[0] === 'p')
            .map(tag => ({
                pubkey: tag[1],
                roles: tag.slice(2)
            }));
    }
    
    /**
     * Helper method to get a tag value
     * @private
     */
    static _getTagValue(event, tagName) {
        const tag = event.tags.find(tag => tag[0] === tagName);
        return tag ? tag[1] : null;
    }
    
    /**
     * Helper method to check if an event has a tag
     * @private
     */
    static _hasTag(event, tagName) {
        return event.tags.some(tag => tag[0] === tagName);
    }
}

export default NostrEvents;
