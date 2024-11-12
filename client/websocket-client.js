class WebSocketClient {
    constructor(serverUrl = 'ws://localhost:8080/ws') {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.messageHandlers = new Set();
        this.currentSessionId = null;
        this.timeout = 5000;
    }

    async connect() {
        if (this.ws) {
            throw new Error('Already connected');
        }

        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => {
                this.setupMessageHandler();
                resolve();
            };

            this.ws.onerror = (error) => {
                reject(new Error(`Connection failed: ${error.message || 'Unknown error'}`));
            };

            this.ws.onclose = () => {
                this.ws = null;
                this.currentSessionId = null;
            };
        });
    }

    setupMessageHandler() {
        this.ws.onmessage = (event) => {
            const messageStr = event.data;
            try {
                JSON.parse(messageStr);
                // If it parsed successfully, it's a command response - don't forward
            } catch (e) {
                // If it's not JSON, it's a relayed message - notify handlers
                this.messageHandlers.forEach(handler => handler(messageStr));
            }
        };
    }

    async sendCommand(data) {
        if (!this.ws) {
            throw new Error('Not connected');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                messageHandler.cleanup();
                reject(new Error('Command timeout'));
            }, this.timeout);

            const messageHandler = {
                handle: (event) => {
                    try {
                        const response = JSON.parse(event.data);
                        clearTimeout(timeout);
                        messageHandler.cleanup();
                        resolve(response);
                    } catch (e) {
                        // Ignore non-JSON messages (they're relayed messages)
                    }
                },
                cleanup: () => {
                    this.ws.removeEventListener('message', messageHandler.handle);
                }
            };

            this.ws.addEventListener('message', messageHandler.handle);

            try {
                this.ws.send(JSON.stringify(data));
            } catch (e) {
                clearTimeout(timeout);
                messageHandler.cleanup();
                reject(new Error(`Failed to send command: ${e.message}`));
            }
        });
    }

    async createSession() {
        const response = await this.sendCommand({ type: 'create' });
        if (response.response === 'success') {
            this.currentSessionId = response.id;
            return response.id;
        }
        throw new Error(`Failed to create session: ${response.reason || 'Unknown error'}`);
    }

    async joinSession(sessionId) {
        const response = await this.sendCommand({
            type: 'join',
            id: sessionId
        });

        if (response.response === 'success') {
            this.currentSessionId = sessionId;
            return true;
        }
        throw new Error(`Failed to join session: ${response.reason || 'Unknown error'}`);
    }

    async leaveSession() {
        if (!this.currentSessionId) {
            throw new Error('Not in a session');
        }

        const response = await this.sendCommand({
            type: 'leave',
            id: this.currentSessionId
        });

        if (response.response === 'success') {
            this.currentSessionId = null;
            return true;
        }
        throw new Error(`Failed to leave session: ${response.reason || 'Unknown error'}`);
    }

    async sendMessage(message) {
        if (!this.currentSessionId) {
            throw new Error('Not in a session');
        }

        const response = await this.sendCommand({
            type: 'message',
            id: this.currentSessionId,
            payload: message
        });

        if (response.response === 'success') {
            return true;
        }
        throw new Error(`Failed to send message: ${response.reason || 'Unknown error'}`);
    }

    onMessage(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);  // Returns function to remove handler
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.currentSessionId = null;
        }
    }

    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    getCurrentSessionId() {
        return this.currentSessionId;
    }
}

// Make it available in both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebSocketClient };
} else {
    window.WebSocketClient = WebSocketClient;
}