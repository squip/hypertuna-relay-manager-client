/**
 * AppIntegration.js
 * Modifies the existing App to use real nostr relays
 * Enhanced with support for Hypertuna relay groups
 */

import NostrIntegration from './NostrIntegration.js';
import { NostrUtils } from './NostrUtils.js';

/**
 * This function modifies the existing App object to use real nostr relays
 * Call this function after the App has been initialized
 * @param {Object} App - The existing App object
 */
function integrateNostrRelays(App) {
    console.log('Integrating nostr relays with Hypertuna support...');
    
    // Save original methods before replacing them
    const originalMethods = {
        connectRelay: App.connectRelay.bind(App),
        loadGroups: App.loadGroups.bind(App),
        loadGroupDetails: App.loadGroupDetails.bind(App),
        loadGroupMessages: App.loadGroupMessages.bind(App),
        loadGroupMembers: App.loadGroupMembers.bind(App),
        createGroup: App.createGroup.bind(App),
        joinGroup: App.joinGroup.bind(App),
        leaveGroup: App.leaveGroup.bind(App),
        sendMessage: App.sendMessage.bind(App),
        createInvite: App.createInvite.bind(App),
        addMember: App.addMember.bind(App),
        updateMemberRole: App.updateMemberRole.bind(App),
        removeMember: App.removeMember.bind(App),
        saveGroupSettings: App.saveGroupSettings.bind(App),
        deleteGroup: App.deleteGroup.bind(App),
        updateProfile: App.updateProfile.bind(App)
    };
    
    // Create nostr integration
    App.nostr = new NostrIntegration(App);
    
    /**
     * Replace relay connection method
     * Uses real WebSocket connections to nostr relays
     */
    App.connectRelay = async function() {
        try {
            if (!this.currentUser) {
                throw new Error('User not logged in');
            }
            
            // If we're using the local relay, switch to real relays
            if (this.relay && this.relay.isConnected()) {
                this.relay.disconnect();
            }
            
            // Initialize the nostr client
            await this.nostr.connectRelay();
            
            document.getElementById('relay-status').className = 'alert alert-success';
            document.getElementById('relay-status').innerHTML = 'Connected to nostr relays';
            
            this.updateUIState();
        } catch (e) {
            console.error('Error connecting to relays:', e);
            
            document.getElementById('relay-status').className = 'alert alert-error';
            document.getElementById('relay-status').textContent = 'Error connecting to relays: ' + e.message;
        }
    };
    
    /**
     * Replace load groups method
     * Gets Hypertuna groups from the nostr client
     */
    App.loadGroups = async function() {
        if (!this.currentUser) return;
        
        const groupsContainer = document.getElementById('groups-container');
        groupsContainer.innerHTML = '<div class="alert">Loading groups...</div>';
        
        try {
            // Get groups from the nostr client - filtered for Hypertuna groups
            const groups = this.nostr.getGroups();
            
            if (groups.length === 0) {
                groupsContainer.innerHTML = `
                    <div class="alert">
                        No Hypertuna groups found. <a href="#" id="create-first-group">Create your first group</a>
                    </div>
                `;
                
                document.getElementById('create-first-group').addEventListener('click', e => {
                    e.preventDefault();
                    this.navigateTo('create-group');
                });
                
                return;
            }
            
            groupsContainer.innerHTML = '';
            
            groups.forEach(group => {
                // Skip deleted groups
                if (group.event && group.event.markedAsDeleted) return;
                
                const groupElement = document.createElement('div');
                groupElement.className = 'group-card';
                
                // Use hypertunaId as an additional identifier
                const hypertunaId = group.hypertunaId || '';
                
                groupElement.innerHTML = `
                    <div class="group-header">
                        <h3>${group.name}</h3>
                    </div>
                    <div class="group-body">
                        <div class="group-meta">
                            <span>${group.isPublic ? 'Public' : 'Private'}</span>
                            <span>${group.isOpen ? 'Open' : 'Closed'}</span>
                        </div>
                        <div class="group-description">
                            ${group.about || 'No description available.'}
                        </div>
                        <div class="group-actions">
                            <button class="btn btn-view-group" data-group-id="${group.id}" data-hypertuna-id="${hypertunaId}">View</button>
                        </div>
                    </div>
                `;
                
                groupsContainer.appendChild(groupElement);
                
                // Add event listener for the view button
                groupElement.querySelector('.btn-view-group').addEventListener('click', (e) => {
                    const button = e.target;
                    this.currentGroupId = button.dataset.groupId;
                    this.currentHypertunaId = button.dataset.hypertunaId;
                    this.navigateTo('group-detail');
                });
            });
        } catch (e) {
            console.error('Error loading groups:', e);
            groupsContainer.innerHTML = `
                <div class="alert alert-error">
                    Error loading groups. Please try again.
                </div>
            `;
        }
    };

    /**
     * Enhanced profile display method
     */
    App.updateProfileDisplay = function() {
        if (!this.currentUser) return;
        
        // Try to get profile from nostr client cache
        let profile = null;
        if (this.nostr && this.nostr.client) {
            profile = this.nostr.client.cachedProfiles.get(this.currentUser.pubkey);
        }
        
        // If no profile found, use basic info
        if (!profile) {
            profile = {
                name: this.currentUser.name || 'User_' + NostrUtils.truncatePubkey(this.currentUser.pubkey),
                about: this.currentUser.about || '',
                picture: null
            };
        }
        
        const name = profile.name || 'User_' + NostrUtils.truncatePubkey(this.currentUser.pubkey);
        
        console.log('Updating profile display with:', {
            name: profile.name,
            about: profile.about ? profile.about.substring(0, 30) + '...' : undefined,
            picture: profile.picture ? 'present' : undefined
        });
        
        // Update profile display on auth page
        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-pubkey').textContent = this.currentUser.pubkey;
        
        // Update profile page
        document.getElementById('profile-display-name').textContent = name;
        document.getElementById('profile-display-pubkey').textContent = this.currentUser.pubkey;
        document.getElementById('profile-name-input').value = profile.name || '';
        document.getElementById('profile-about-input').value = profile.about || '';
        document.getElementById('profile-pubkey-display').value = this.currentUser.pubkey;
        document.getElementById('profile-privkey-display').value = this.currentUser.privateKey;
        
        // Update profile picture if available
        const updateProfilePicture = (selector) => {
            const avatar = document.querySelector(selector);
            if (avatar) {
                if (profile.picture) {
                    console.log(`Setting profile picture from URL: ${profile.picture}`);
                    // Replace the text content with an image
                    avatar.innerHTML = `<img src="${profile.picture}" alt="${name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                } else {
                    console.log(`Using initials for profile avatar: ${name.charAt(0).toUpperCase()}`);
                    // Use first character of name as avatar
                    avatar.textContent = name.charAt(0).toUpperCase();
                }
            }
        };
        
        // Update profile pictures in all locations
        updateProfilePicture('#profile-display .profile-avatar');
        updateProfilePicture('.page#page-profile .profile-avatar');
        
        // Populate relay list if using real relays
        if (this.nostr && this.nostr.client) {
            document.getElementById('profile-relay-urls').value = this.nostr.client.relayManager.getRelays().join('\n');
        }
        
        console.log('Profile display updated successfully');
    };
    
    /**
     * Replace load group details method
     * Gets group details from the nostr client
     */
    App.loadGroupDetails = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            // Subscribe to this group's events
            this.nostr.client.subscribeToGroup(this.currentGroupId);
            
            // Load group data
            const group = this.nostr.getGroupById(this.currentGroupId);
            if (!group || (group.event && group.event.markedAsDeleted)) {
                alert('Group not found or has been deleted');
                this.navigateTo('groups');
                return;
            }
            
            this.currentGroup = group;
            this.currentHypertunaId = group.hypertunaId;
            
            // Update group header
            document.getElementById('group-detail-name').textContent = group.name;
            document.getElementById('group-detail-visibility').textContent = group.isPublic ? 'Public' : 'Private';
            document.getElementById('group-detail-join-type').textContent = group.isOpen ? 'Open' : 'Closed';
            document.getElementById('group-detail-description').textContent = group.about || 'No description available.';
            
            // Load members and check if user is a member/admin - with retries
            await this.loadGroupMembers();
            
            // Check if creator of group is automatically admin and member
            const isCreator = group.event && group.event.pubkey === this.currentUser.pubkey;
            console.log(`Current user is group creator: ${isCreator}`);
            
            // If they're the creator, force-add them to admin and member lists if not already there
            if (isCreator) {
                if (!this.nostr.isGroupAdmin(this.currentGroupId, this.currentUser.pubkey)) {
                    console.log('Group creator not in admin list, adding manually');
                    this.nostr.client.groupAdmins.set(
                        this.currentGroupId, 
                        [...(this.nostr.client.groupAdmins.get(this.currentGroupId) || []),
                        { pubkey: this.currentUser.pubkey, roles: ['admin'] }]
                    );
                }
                
                if (!this.nostr.isGroupMember(this.currentGroupId, this.currentUser.pubkey)) {
                    console.log('Group creator not in member list, adding manually');
                    this.nostr.client.groupMembers.set(
                        this.currentGroupId, 
                        [...(this.nostr.client.groupMembers.get(this.currentGroupId) || []),
                        { pubkey: this.currentUser.pubkey, roles: ['member'] }]
                    );
                }
            }
            
            // Re-check member and admin status
            const isMember = this.nostr.isGroupMember(this.currentGroupId, this.currentUser.pubkey);
            const isAdmin = this.nostr.isGroupAdmin(this.currentGroupId, this.currentUser.pubkey);
            
            console.log(`Final status checks - isMember: ${isMember}, isAdmin: ${isAdmin}`);
            
            // Update join/leave buttons
            document.getElementById('btn-join-group').classList.toggle('hidden', isMember);
            document.getElementById('btn-leave-group').classList.toggle('hidden', !isMember);
            
            // Load messages if user is a member
            if (isMember) {
                this.loadGroupMessages();
            } else {
                document.getElementById('message-list').innerHTML = `
                    <div class="alert">
                        You need to join this group to view messages.
                    </div>
                `;
                document.getElementById('message-input').disabled = true;
                document.getElementById('btn-send-message').disabled = true;
            }
            
            // Update admin panel visibility
            document.getElementById('admin-panel').classList.toggle('hidden', !isAdmin);
            
            // Update settings form
            const settingsForm = document.getElementById('group-settings-form');
            const noPermissionMsg = document.getElementById('group-settings-no-permission');
            
            if (isAdmin) {
                settingsForm.classList.remove('hidden');
                noPermissionMsg.classList.add('hidden');
                
                // Populate settings form
                document.getElementById('edit-group-name').value = group.name;
                document.getElementById('edit-group-description').value = group.about || '';
                document.getElementById('edit-group-public').checked = group.isPublic;
                document.getElementById('edit-group-open').checked = group.isOpen;
                document.getElementById('edit-group-public-value').textContent = group.isPublic ? 'Public' : 'Private';
                document.getElementById('edit-group-open-value').textContent = group.isOpen ? 'Open' : 'Closed';
            } else {
                settingsForm.classList.add('hidden');
                noPermissionMsg.classList.remove('hidden');
            }
        } catch (e) {
            console.error('Error loading group details:', e);
            alert('Error loading group details');
        }
    };
    
    /**
     * Replace load group messages method
     * Gets messages from the nostr client
     */
    App.loadGroupMessages = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            const isMember = this.nostr.isGroupMember(this.currentGroupId, this.currentUser.pubkey);
            if (!isMember) return;
            
            const messageList = document.getElementById('message-list');
            messageList.innerHTML = '';
            
            // Get messages for the group
            const messages = this.nostr.getGroupMessages(this.currentGroupId);
            
            if (messages.length === 0) {
                messageList.innerHTML = `
                    <div class="alert">
                        No messages yet. Be the first to send a message!
                    </div>
                `;
                return;
            }
            
            // Get profiles for all message authors
            const profiles = {};
            const authors = [...new Set(messages.map(msg => msg.pubkey))];
            
            // Fetch profiles for each author
            for (const pubkey of authors) {
                try {
                    const profile = await this.nostr.client.fetchUserProfile(pubkey);
                    profiles[pubkey] = profile;
                } catch (e) {
                    profiles[pubkey] = { name: 'User_' + NostrUtils.truncatePubkey(pubkey) };
                }
            }
            
            // Display messages
            messages.forEach(message => {
                const author = profiles[message.pubkey] || { name: 'User_' + NostrUtils.truncatePubkey(message.pubkey) };
                const isCurrentUser = message.pubkey === this.currentUser.pubkey;
                
                const messageElement = document.createElement('div');
                messageElement.className = 'message';
                messageElement.style.marginLeft = isCurrentUser ? 'auto' : '0';
                messageElement.style.marginRight = isCurrentUser ? '0' : 'auto';
                messageElement.style.maxWidth = '80%';
                messageElement.style.backgroundColor = isCurrentUser ? '#e6f7ff' : '#fff';
                
                messageElement.innerHTML = `
                    <div class="message-meta">
                        <span>${author.name || 'Unknown'}</span>
                        <span>${NostrUtils.formatTime(message.created_at)}</span>
                    </div>
                    <div class="message-content">
                        ${message.content}
                    </div>
                `;
                
                messageList.appendChild(messageElement);
            });
            
            // Scroll to bottom
            messageList.scrollTop = messageList.scrollHeight;
            
            // Enable message input
            document.getElementById('message-input').disabled = false;
            document.getElementById('btn-send-message').disabled = false;
            
        } catch (e) {
            console.error('Error loading messages:', e);
            document.getElementById('message-list').innerHTML = `
                <div class="alert alert-error">
                    Error loading messages. Please try again.
                </div>
            `;
        }
    };
    
    /**
     * Replace load group members method
     * Gets members from the nostr client
     */
    App.loadGroupMembers = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            const memberList = document.getElementById('member-list');
            memberList.innerHTML = '';
            
            // Get members and admins
            const members = this.nostr.getGroupMembers(this.currentGroupId);
            const admins = this.nostr.getGroupAdmins(this.currentGroupId);
            
            // Create a mapping of pubkeys to roles
            const memberRoles = {};
            
            members.forEach(member => {
                memberRoles[member.pubkey] = ['member'];
            });
            
            admins.forEach(admin => {
                memberRoles[admin.pubkey] = admin.roles || ['admin'];
            });
            
            // Get profiles for all members
            const profiles = {};
            const pubkeys = Object.keys(memberRoles);
            
            // Fetch profiles for each member
            for (const pubkey of pubkeys) {
                try {
                    const profile = await this.nostr.client.fetchUserProfile(pubkey);
                    profiles[pubkey] = profile;
                } catch (e) {
                    profiles[pubkey] = { name: 'User_' + NostrUtils.truncatePubkey(pubkey) };
                }
            }
            
            // Display members
            if (pubkeys.length === 0) {
                memberList.innerHTML = `
                    <div class="alert">
                        No members in this group yet.
                    </div>
                `;
                return;
            }
            
            const isAdmin = this.nostr.isGroupAdmin(this.currentGroupId, this.currentUser.pubkey);
            
            pubkeys.forEach(pubkey => {
                const profile = profiles[pubkey] || {};
                const roles = memberRoles[pubkey] || ['member'];
                const isCurrentUser = pubkey === this.currentUser.pubkey;
                
                const memberElement = document.createElement('div');
                memberElement.className = 'member-card';
                
                const name = profile.name || 'User_' + NostrUtils.truncatePubkey(pubkey);
                const roleText = roles.join(', ');
                
                memberElement.innerHTML = `
                    <div class="member-avatar">${name.charAt(0).toUpperCase()}</div>
                    <div class="member-name">${name}</div>
                    <div class="profile-pubkey truncate">${NostrUtils.truncatePubkey(pubkey)}</div>
                    <div class="member-role">${roleText}</div>
                `;
                
                // Add admin actions if current user is an admin
                if (isAdmin && !isCurrentUser) {
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'member-actions';
                    
                    // Promote to admin button
                    if (!roles.includes('admin')) {
                        const promoteBtn = document.createElement('button');
                        promoteBtn.className = 'btn btn-secondary';
                        promoteBtn.textContent = 'Make Admin';
                        promoteBtn.style.fontSize = '12px';
                        promoteBtn.style.padding = '5px 10px';
                        
                        promoteBtn.addEventListener('click', () => {
                            this.updateMemberRole(pubkey, ['admin']);
                        });
                        
                        actionsDiv.appendChild(promoteBtn);
                    }
                    
                    // Remove member button
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn btn-danger';
                    removeBtn.textContent = 'Remove';
                    removeBtn.style.fontSize = '12px';
                    removeBtn.style.padding = '5px 10px';
                    
                    removeBtn.addEventListener('click', () => {
                        this.removeMember(pubkey);
                    });
                    
                    actionsDiv.appendChild(removeBtn);
                    memberElement.appendChild(actionsDiv);
                }
                
                memberList.appendChild(memberElement);
            });
            
        } catch (e) {
            console.error('Error loading members:', e);
            document.getElementById('member-list').innerHTML = `
                <div class="alert alert-error">
                    Error loading members. Please try again.
                </div>
            `;
        }
    };
    
    /**
     * Replace create group method
     * Creates a group via the nostr client with Hypertuna events
     */
    // In AppIntegration.js in the createGroup method
    // In AppIntegration.js, update the createGroup method:
    App.createGroup = async function() {
        if (!this.currentUser) return;
        
        const name = document.getElementById('new-group-name').value.trim();
        const about = document.getElementById('new-group-description').value.trim();
        const isPublic = document.getElementById('new-group-public').checked;
        const isOpen = document.getElementById('new-group-open').checked;
        
        if (!name) {
            alert('Please enter a group name.');
            return;
        }
        
        try {
            console.log("Creating group with parameters:", { name, about, isPublic, isOpen });
            
            // Create the group with all three related events
            const eventsCollection = await this.nostr.createGroup(name, about, isPublic, isOpen);
            
            console.log(`Group created successfully with ID: ${eventsCollection.groupId}`);
            console.log(`Hypertuna ID: ${eventsCollection.hypertunaId}`);
            
            // Store the Hypertuna ID for future use
            this.currentHypertunaId = eventsCollection.hypertunaId;
            
            // Give the relays time to process the events
            console.log("Waiting for relays to process events...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Force-load the groups to ensure the new group appears
            console.log("Force reloading groups list...");
            this.loadGroups();
            
            alert('Group created successfully!');
            this.navigateTo('groups');
        } catch (e) {
            console.error('Error creating group:', e);
            alert('Error creating group: ' + e.message);
        }
    };
    
    /**
     * Replace join group method
     * Joins a group via the nostr client
     */
    App.joinGroup = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            const group = this.nostr.getGroupById(this.currentGroupId);
            if (!group) return;
            
            if (group.isOpen) {
                // For open groups, create join request
                await this.sendJoinRequest();
            } else {
                // For closed groups, show invite code modal
                this.showJoinModal();
            }
        } catch (e) {
            console.error('Error joining group:', e);
            alert('Error joining group: ' + e.message);
        }
    };
    
    /**
     * Replace send join request method
     * Sends a join request via the nostr client
     */
    App.sendJoinRequest = async function(inviteCode = null) {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            await this.nostr.joinGroup(this.currentGroupId, inviteCode);
            
            // Reload group details to reflect membership changes
            setTimeout(() => {
                this.loadGroupDetails();
            }, 1000);
            
        } catch (e) {
            console.error('Error sending join request:', e);
            alert('Error joining group: ' + e.message);
            throw e;
        }
    };
    
    /**
     * Replace leave group method
     * Leaves a group via the nostr client
     */
    App.leaveGroup = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            await this.nostr.leaveGroup(this.currentGroupId);
            
            // Reload group details to reflect membership changes
            setTimeout(() => {
                this.loadGroupDetails();
            }, 1000);
            
        } catch (e) {
            console.error('Error leaving group:', e);
            alert('Error leaving group: ' + e.message);
        }
    };
    
    /**
     * Replace send message method
     * Sends a message via the nostr client
     */
    App.sendMessage = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        const messageText = document.getElementById('message-input').value.trim();
        if (!messageText) return;
        
        try {
            await this.nostr.sendGroupMessage(this.currentGroupId, messageText);
            
            // Clear input and reload messages
            document.getElementById('message-input').value = '';
            this.loadGroupMessages();
            
        } catch (e) {
            console.error('Error sending message:', e);
            alert('Error sending message: ' + e.message);
        }
    };
    
    /**
     * Replace create invite method
     * Creates an invite code via the nostr client
     */
    App.createInvite = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            await this.nostr.createGroupInvite(this.currentGroupId);
            
            // Wait for relay to process the invite code
            setTimeout(() => {
                // Display the invite code - for real relays, this would require 
                // additional handling to get the invite code from responses
                alert('Invite code created! In a real relay implementation, you would need to handle the invite code response.');
                
                // This would normally come from the relay response
                const inviteCode = NostrUtils.generateInviteCode();
                document.getElementById('invite-code-display').classList.remove('hidden');
                document.getElementById('invite-code-value').textContent = inviteCode;
            }, 1000);
            
        } catch (e) {
            console.error('Error creating invite code:', e);
            alert('Error creating invite code: ' + e.message);
        }
    };
    
    /**
     * Replace add member method
     * Adds a member via the nostr client
     */
    App.addMember = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        const memberPubkey = document.getElementById('add-member-pubkey').value.trim();
        const role = document.getElementById('add-member-role').value;
        
        if (!memberPubkey) {
            alert('Please enter a valid public key.');
            return;
        }
        
        try {
            await this.nostr.addGroupMember(this.currentGroupId, memberPubkey, [role]);
            
            // Clear input and reload members
            document.getElementById('add-member-pubkey').value = '';
            setTimeout(() => {
                this.loadGroupMembers();
            }, 1000);
            
        } catch (e) {
            console.error('Error adding member:', e);
            alert('Error adding member: ' + e.message);
        }
    };
    
    /**
     * Replace update member role method
     * Updates a member's role via the nostr client
     */
    App.updateMemberRole = async function(pubkey, roles) {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            await this.nostr.addGroupMember(this.currentGroupId, pubkey, roles);
            
            // Reload members to reflect changes
            setTimeout(() => {
                this.loadGroupMembers();
            }, 1000);
            
        } catch (e) {
            console.error('Error updating member role:', e);
            alert('Error updating member role: ' + e.message);
        }
    };
    
    /**
     * Replace remove member method
     * Removes a member via the nostr client
     */
    App.removeMember = async function(pubkey) {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            await this.nostr.removeGroupMember(this.currentGroupId, pubkey);
            
            // Reload members to reflect changes
            setTimeout(() => {
                this.loadGroupMembers();
            }, 1000);
            
        } catch (e) {
            console.error('Error removing member:', e);
            alert('Error removing member: ' + e.message);
        }
    };
    
    /**
     * Replace save group settings method
     * Updates group settings via the nostr client with metadata events
     */
    App.saveGroupSettings = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        const name = document.getElementById('edit-group-name').value.trim();
        const about = document.getElementById('edit-group-description').value.trim();
        const isPublic = document.getElementById('edit-group-public').checked;
        const isOpen = document.getElementById('edit-group-open').checked;
        
        if (!name) {
            alert('Please enter a group name.');
            return;
        }
        
        try {
            // Update group metadata with both kind 9002 and 39000 events
            const events = await this.nostr.updateGroupMetadata(this.currentGroupId, {
                name,
                about,
                isPublic,
                isOpen
            });
            
            // Reload group details to reflect changes
            setTimeout(() => {
                this.loadGroupDetails();
            }, 1000);
            
            alert('Group settings updated successfully!');
            
        } catch (e) {
            console.error('Error updating group settings:', e);
            alert('Error updating group settings: ' + e.message);
        }
    };
    
    /**
     * Replace delete group method
     * Deletes a group via the nostr client
     */
    App.deleteGroup = async function() {
        if (!this.currentUser || !this.currentGroupId) return;
        
        try {
            await this.nostr.deleteGroup(this.currentGroupId);
            
            this.closeConfirmationModal();
            alert('Group deletion request sent! The group will be removed once relays process the event.');
            
            // Navigate back to groups list
            setTimeout(() => {
                this.navigateTo('groups');
            }, 1000);
            
        } catch (e) {
            console.error('Error deleting group:', e);
            alert('Error deleting group: ' + e.message);
        }
    };
    
    /**
     * Replace update profile method
     * Updates user profile via the nostr client
     */
    App.updateProfile = async function() {
        if (!this.currentUser) return;
        
        const name = document.getElementById('profile-name-input').value.trim();
        const about = document.getElementById('profile-about-input').value.trim();
        
        try {
            await this.nostr.updateProfile({
                name,
                about
            });
            
            // Update user profile metadata
            this.currentUser.name = name;
            this.currentUser.about = about;
            
            // Save to localStorage
            this.saveUserToLocalStorage();
            
            // Update profile display
            this.updateProfileDisplay();
            
            alert('Profile updated successfully');
        } catch (e) {
            console.error('Error updating profile:', e);
            alert('Error updating profile: ' + e.message);
        }
    };
    
    // Add method to configure relays
    App.configureRelays = function(relayUrls) {
        if (!this.nostr) return;
        
        // Update relay URLs
        this.nostr.updateRelays(relayUrls);
    };
    
    // Initialize nostr integration when user logs in
    const originalLogin = App.login.bind(App);
    App.login = async function() {
        // Call original login method
        originalLogin();
        
        // Initialize nostr integration if login was successful
        if (this.currentUser && this.currentUser.privateKey) {
            try {
                await this.nostr.init(this.currentUser);
                console.log('Nostr integration initialized');
            } catch (e) {
                console.error('Error initializing nostr integration:', e);
            }
        }
    };
    
    // Add method to track Hypertuna ID 
    App.setCurrentHypertunaId = function(hypertunaId) {
        this.currentHypertunaId = hypertunaId;
    };
    
    // Method to confirm join group with invite code
    App.confirmJoinGroup = async function() {
        if (!this.currentUser || !this.currentGroupId) {
            this.closeJoinModal();
            return;
        }
        
        const inviteCode = document.getElementById('invite-code-input').value.trim();
        if (!inviteCode) {
            alert('Please enter an invite code.');
            return;
        }
        
        try {
            await this.sendJoinRequest(inviteCode);
            this.closeJoinModal();
        } catch (e) {
            console.error('Error joining group with invite code:', e);
            // Don't close the modal in case of error, so the user can try again
        }
    };
    
    // Initialize nostr integration if user is already logged in
    if (App.currentUser && App.currentUser.privateKey) {
        App.nostr.init(App.currentUser)
            .then(() => console.log('Nostr integration initialized'))
            .catch(e => console.error('Error initializing nostr integration:', e));
    }
    
    return App;
}

export default integrateNostrRelays;
