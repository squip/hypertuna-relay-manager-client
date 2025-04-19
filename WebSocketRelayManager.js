/**
 * WebSocketRelayManager.js
 * Handles connections to nostr relays and their lifecycle
 */

class WebSocketRelayManager {
    constructor() {
        this.relays = new Map(); // Map of relay URL -> {conn: WebSocket, status: 'connecting'|'open'|'closed', subscriptions: Map}
        this.globalSubscriptions = new Map(); // Map of subscriptionId -> {filters, callbacks}
        this.eventCallbacks = []; // Array of callbacks for received events
        this.connectCallbacks = []; // Callbacks for relay connections
        this.disconnectCallbacks = []; // Callbacks for relay disconnections
        
        // Add rate limiting
        this.requestQueue = [];
        this.processingQueue = false;
        this.lastRequestTime = 0;
        this.minTimeBetweenRequests = 50; // 50ms between requests to avoid "too fast" errors
    }

    /**
     * Add a relay to the connection pool
     * @param {string} url - The relay URL (e.g., wss://relay.damus.io)
     * @returns {Promise} - Resolves when connected
     */
    addRelay(url) {
        // Normalize URL
        if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
            url = 'wss://' + url;
        }

        // Check if already connected
        if (this.relays.has(url)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                const ws = new WebSocket(url);
                const relayData = {
                    conn: ws,
                    status: 'connecting',
                    subscriptions: new Map(),
                    pendingMessages: []
                };
                
                this.relays.set(url, relayData);

                ws.onopen = () => {
                    console.log(`Connected to relay: ${url}`);
                    relayData.status = 'open';
                    
                    // Send any pending messages with rate limiting
                    if (relayData.pendingMessages.length > 0) {
                        relayData.pendingMessages.forEach(msg => {
                            this._queueRequest(() => {
                                if (ws.readyState === WebSocket.OPEN) {
                                    ws.send(msg);
                                }
                            });
                        });
                        relayData.pendingMessages = [];
                    }
                    
                    // Apply global subscriptions to this relay
                    this.globalSubscriptions.forEach((subData, subId) => {
                        this._subscribeOnRelay(url, subId, subData.filters);
                    });
                    
                    // Notify connect listeners
                    this.connectCallbacks.forEach(callback => callback(url));
                    
                    resolve();
                };

                ws.onclose = () => {
                    console.log(`Disconnected from relay: ${url}`);
                    relayData.status = 'closed';
                    
                    // Notify disconnect listeners
                    this.disconnectCallbacks.forEach(callback => callback(url));
                    
                    // Attempt reconnection after delay
                    setTimeout(() => {
                        this.addRelay(url).catch(console.error);
                    }, 5000);
                };

                ws.onerror = (error) => {
                    console.error(`Error with relay ${url}:`, error);
                    // If still connecting, reject the promise
                    if (relayData.status === 'connecting') {
                        reject(error);
                    }
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._handleRelayMessage(url, data);
                    } catch (e) {
                        console.error(`Error parsing message from ${url}:`, e);
                    }
                };
            } catch (e) {
                console.error(`Error connecting to ${url}:`, e);
                reject(e);
            }
        });
    }

    /**
     * Process the request queue with rate limiting
     * @private
     */
    _processQueue() {
        if (this.requestQueue.length === 0) {
            this.processingQueue = false;
            return;
        }

        this.processingQueue = true;
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        // If we need to wait, schedule the next request
        if (timeSinceLastRequest < this.minTimeBetweenRequests) {
            setTimeout(() => this._processQueue(), 
                this.minTimeBetweenRequests - timeSinceLastRequest);
            return;
        }

        // Process the next request
        const request = this.requestQueue.shift();
        this.lastRequestTime = Date.now();
        
        try {
            request();
        } catch (e) {
            console.error('Error processing request:', e);
        }

        // Continue processing queue if there are more items
        if (this.requestQueue.length > 0) {
            setTimeout(() => this._processQueue(), this.minTimeBetweenRequests);
        } else {
            this.processingQueue = false;
        }
    }

    // Add this method to WebSocketRelayManager class
_validateEvent(event) {
    // Check required fields
    if (!event || !event.id || !event.pubkey || !event.sig) {
        return { valid: false, reason: 'Missing required fields (id, pubkey, or sig)' };
    }
    
    // Check for valid timestamps
    if (!event.created_at || typeof event.created_at !== 'number') {
        return { valid: false, reason: 'Invalid or missing created_at timestamp' };
    }
    
    // Check event kind
    if (typeof event.kind !== 'number') {
        return { valid: false, reason: 'Invalid or missing event kind' };
    }
    
    // Check that tags is an array
    if (!Array.isArray(event.tags)) {
        return { valid: false, reason: 'Tags must be an array' };
    }
    
    // Validate signature length
    if (event.sig.length !== 128) {
        return { valid: false, reason: `Invalid signature length: ${event.sig.length}, expected 128` };
    }
    
    return { valid: true };
}

    /**
     * Queue a request to be sent to a relay with rate limiting
     * @param {Function} request - Function to execute
     * @private
     */
    _queueRequest(request) {
        this.requestQueue.push(request);
        
        if (!this.processingQueue) {
            this._processQueue();
        }
    }

    /**
     * Remove a relay from the connection pool
     * @param {string} url - The relay URL
     */
    removeRelay(url) {
        if (!this.relays.has(url)) {
            return;
        }

        const relay = this.relays.get(url);
        if (relay.conn && relay.conn.readyState !== WebSocket.CLOSED) {
            relay.conn.close();
        }
        
        this.relays.delete(url);
    }

    /**
     * Get all connected relays
     * @returns {Array} - Array of relay URLs
     */
    getRelays() {
        return Array.from(this.relays.keys());
    }

    /**
     * Get relay connection status
     * @param {string} url - The relay URL
     * @returns {string|null} - Status or null if relay not found
     */
    getRelayStatus(url) {
        if (!this.relays.has(url)) {
            return null;
        }
        return this.relays.get(url).status;
    }

    /**
     * Generate a shorter subscription ID based on the original and index
     * @param {string} subscriptionId - The original subscription ID
     * @returns {string} - A shorter subscription ID
     * @private
     */
    _shortenSubscriptionId(subscriptionId) {
        // If already short enough, return as is
        if (subscriptionId.length <= 8) {
            return subscriptionId;
        }
        
        // Otherwise generate a short ID based on the first 8 characters
        return subscriptionId.substring(0, 8);
    }

    /**
     * Create a subscription for events matching the given filters
     * @param {string} subscriptionId - A unique ID for this subscription
     * @param {Array} filters - Array of filter objects
     * @param {Function} callback - Function to call when events arrive
     */
    subscribe(subscriptionId, filters, callback) {
        // Create a shorter subscription ID for the wire protocol
        const shortSubId = this._shortenSubscriptionId(subscriptionId);
        
        console.log(`Creating subscription: ${subscriptionId} (${shortSubId})`);
        console.log(`Subscription filters:`, JSON.stringify(filters));
        
        // Add to global subscriptions with the original ID as key
        this.globalSubscriptions.set(subscriptionId, {
            shortId: shortSubId,
            filters,
            callbacks: callback ? [callback] : []
        });
    
        // Apply to all connected relays
        this.relays.forEach((relay, url) => {
            if (relay.status === 'open') {
                console.log(`Sending subscription to relay: ${url}`);
                this._subscribeOnRelay(url, subscriptionId, filters);
            }
        });
    
        return subscriptionId;
    }
    
    /**
     * Internal method to subscribe on a specific relay
     * @private
     */
    _subscribeOnRelay(relayUrl, subscriptionId, filters) {
        const relay = this.relays.get(relayUrl);
        if (!relay || relay.status !== 'open') {
            console.log(`Cannot subscribe to ${relayUrl}, relay not connected`);
            return;
        }
    
        // Get the short ID for this subscription
        const shortSubId = this.globalSubscriptions.get(subscriptionId).shortId;
    
        // Create a REQ message
        const reqMsg = JSON.stringify(['REQ', shortSubId, ...filters]);
        console.log(`REQ message to ${relayUrl}:`, reqMsg);
        
        // Queue the subscription request
        this._queueRequest(() => {
            if (relay.status === 'open') {
                relay.conn.send(reqMsg);
                console.log(`Subscription ${shortSubId} sent to ${relayUrl}`);
                
                // Track subscription on this relay using the original ID as key
                relay.subscriptions.set(subscriptionId, {
                    shortId: shortSubId,
                    filters: filters
                });
            } else {
                console.log(`Relay ${relayUrl} not open, queueing subscription`);
                relay.pendingMessages.push(reqMsg);
            }
        });
    }

    /**
     * Close a subscription
     * @param {string} subscriptionId - The subscription ID to close
     */
    unsubscribe(subscriptionId) {
        // Remove from global subscriptions
        const subData = this.globalSubscriptions.get(subscriptionId);
        if (!subData) return;
        
        const shortSubId = subData.shortId;
        this.globalSubscriptions.delete(subscriptionId);

        // Send CLOSE to all relays that have this subscription
        this.relays.forEach((relay, url) => {
            if (relay.status === 'open' && relay.subscriptions.has(subscriptionId)) {
                const closeMsg = JSON.stringify(['CLOSE', shortSubId]);
                
                this._queueRequest(() => {
                    if (relay.status === 'open') {
                        relay.conn.send(closeMsg);
                    }
                });
                
                relay.subscriptions.delete(subscriptionId);
            }
        });
    }

    /**
     * Publish an event to all connected relays
     * @param {Object} event - Signed nostr event object
     * @returns {Promise} - Resolves when published to at least one relay
     */
    publish(event) {
        // Validate event has required fields
        const validation = this._validateEvent(event);
        if (!validation.valid) {
            console.error('Invalid event:', validation.reason, event);
            return Promise.reject(new Error(`Invalid event: ${validation.reason}`));
        }
        
        console.log('Publishing event:', {
            id: event.id,
            kind: event.kind,
            created_at: event.created_at,
            pubkey: event.pubkey.substring(0, 8) + '...',
            sig_length: event.sig ? event.sig.length : 0,
            content_length: event.content ? event.content.length : 0,
            tags_count: event.tags ? event.tags.length : 0
        });
        
        // Create EVENT message
        const eventMsg = JSON.stringify(['EVENT', event]);
        const truncatedMsg = eventMsg.length > 200 ? 
            eventMsg.substring(0, 197) + '...' : 
            eventMsg;
        console.log(`EVENT message to publish: ${truncatedMsg}`);
        
        // Create OK promises for each relay
        const publishPromises = [];
    
        this.relays.forEach((relay, url) => {
            console.log(`Attempting to publish to relay: ${url}`);
            
            const publishPromise = new Promise((resolve, reject) => {
                // Create a timeout for this publish
                const timeout = setTimeout(() => {
                    // Remove the one-time event listener if it times out
                    if (okHandler) {
                        relay.conn.removeEventListener('message', okHandler);
                    }
                    console.warn(`Publish to ${url} timed out for event ${event.id.substring(0, 8)}...`);
                    reject(new Error(`Publish to ${url} timed out`));
                }, 10000);
                
                // Create a one-time event handler for the OK response
                const okHandler = (msgEvent) => {
                    try {
                        const data = JSON.parse(msgEvent.data);
                        
                        // Check if this is an OK response for our event
                        if (Array.isArray(data) && data[0] === 'OK' && data[1] === event.id) {
                            console.log(`Received OK from ${url} for event ${event.id.substring(0, 8)}...`, data);
                            
                            clearTimeout(timeout);
                            relay.conn.removeEventListener('message', okHandler);
                            
                            // Resolve with success or error based on relay response
                            if (data.length > 2 && data[2] === true) {
                                console.log(`Success publish to ${url} for event ${event.id.substring(0, 8)}...`);
                                resolve({ url, success: true });
                            } else {
                                const errorMsg = data.length > 3 ? data[3] : 'Unknown error';
                                console.warn(`Failed publish to ${url}: ${errorMsg}`);
                                resolve({ url, success: false, error: errorMsg });
                            }
                        }
                    } catch (e) {
                        console.warn(`Error parsing message from ${url}:`, e, msgEvent.data);
                    }
                };
    
                // Send the event
                if (relay.status === 'open') {
                    try {
                        // Listen for the OK response
                        relay.conn.addEventListener('message', okHandler);
                        
                        // Queue the publish request
                        this._queueRequest(() => {
                            try {
                                if (relay.conn.readyState === WebSocket.OPEN) {
                                    relay.conn.send(eventMsg);
                                    console.log(`Event sent to ${url}`);
                                } else {
                                    // If connection closed while in queue
                                    console.log(`Relay ${url} disconnected, queueing event`);
                                    relay.pendingMessages.push(eventMsg);
                                    resolve({ url, success: true, queued: true });
                                }
                            } catch (err) {
                                console.warn(`Error sending to ${url}:`, err);
                                resolve({ url, success: false, error: err.message });
                            }
                        });
                    } catch (err) {
                        console.warn(`Error setting up publish to ${url}:`, err);
                        resolve({ url, success: false, error: err.message });
                    }
                } else {
                    // Queue the message to be sent when connected
                    console.log(`Relay ${url} not open, queueing message`);
                    relay.pendingMessages.push(eventMsg);
                    resolve({ url, success: true, queued: true });
                }
            });
    
            publishPromises.push(publishPromise);
        });
    
        // Return a promise that resolves when published to at least one relay
        return Promise.allSettled(publishPromises).then(results => {
            const successful = results.filter(r => r.status === 'fulfilled' && (r.value.success || r.value.queued));
            const queued = results.filter(r => r.status === 'fulfilled' && r.value.queued);
            
            if (successful.length > 0) {
                console.log(`Event ${event.id.substring(0, 8)}... published to ${successful.length} relays`);
                return { 
                    success: true, 
                    count: successful.length,
                    relays: successful.map(r => r.value.url),
                    queued: queued.length > 0
                };
            } else {
                // Log failed publish attempts for debugging
                console.error('Failed to publish to any relays, attempts:', 
                    results.map(r => ({
                        status: r.status,
                        value: r.status === 'fulfilled' ? r.value : r.reason
                    }))
                );
                return Promise.reject(new Error('Failed to publish to any relays'));
            }
        });
    }

    /**
     * Add a callback for received events
     * @param {Function} callback - Function to call with the event
     */
    onEvent(callback) {
        if (typeof callback === 'function') {
            this.eventCallbacks.push(callback);
        }
    }

    // Add this function to test basic connectivity
async testPublish() {
    if (this.relays.size === 0) {
        console.error('No relays connected');
        return;
    }
    
    // Create a minimal test event
    const testEvent = {
        id: '0'.repeat(64),  // All zeros, just for testing
        pubkey: '0'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Test event from relay manager',
        sig: '0'.repeat(128) // Invalid signature, but correct length
    };
    
    console.log('Publishing test event...');
    try {
        await this.publish(testEvent);
        console.log('Test publish completed');
    } catch (error) {
        console.error('Test publish failed:', error);
    }
}

    /**
     * Add a callback for relay connections
     * @param {Function} callback - Function to call with the relay URL
     */
    onConnect(callback) {
        if (typeof callback === 'function') {
            this.connectCallbacks.push(callback);
        }
    }

    /**
     * Add a callback for relay disconnections
     * @param {Function} callback - Function to call with the relay URL
     */
    onDisconnect(callback) {
        if (typeof callback === 'function') {
            this.disconnectCallbacks.push(callback);
        }
    }

    /**
     * Handle message from a relay
     * @private
     */
    _handleRelayMessage(relayUrl, message) {
        if (!Array.isArray(message)) {
            return;
        }

        const messageType = message[0];

        console.log(`Relay message from ${relayUrl}: ${messageType}`, message);

        if (messageType === 'EVENT') {
            // ["EVENT", <subscription_id>, <event>]
            if (message.length < 3) return;
            
            const shortSubId = message[1];
            const event = message[2];
            
            // Find the original subscription ID from the short ID
            let originalSubId = null;
            this.globalSubscriptions.forEach((subData, subId) => {
                if (subData.shortId === shortSubId) {
                    originalSubId = subId;
                }
            });
            
            // If we can't find the subscription, ignore the event
            if (!originalSubId) return;
            
            // Notify global subscription callbacks
            const subscription = this.globalSubscriptions.get(originalSubId);
            if (subscription) {
                subscription.callbacks.forEach(callback => {
                    try {
                        callback(event, relayUrl, originalSubId);
                    } catch (e) {
                        console.error('Error in subscription callback:', e);
                    }
                });
            }
            
            // Notify global event listeners
            this.eventCallbacks.forEach(callback => {
                try {
                    callback(event, relayUrl, originalSubId);
                } catch (e) {
                    console.error('Error in event callback:', e);
                }
            });
        }
        else if (messageType === 'EOSE') {
            // ["EOSE", <subscription_id>]
            // End of stored events, we could notify listeners if needed
            // console.log(`End of stored events for subscription ${message[1]} from ${relayUrl}`);
        }
        else if (messageType === 'NOTICE') {
            // ["NOTICE", <message>]
            console.log(`Notice from ${relayUrl}: ${message[1]}`);
        }
        else if (messageType === 'OK') {
            // ["OK", <event_id>, <success>, <message>]
            // We handle these in the publish method
        }
    }
}

// Export the class
export default WebSocketRelayManager;
