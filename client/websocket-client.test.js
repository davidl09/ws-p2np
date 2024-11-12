const { WebSocketClient } = require('./websocket-client');

describe('WebSocketClient', () => {
    let client;
    let mockWs;

    beforeEach(async () => {
        client = new WebSocketClient();
        const connectPromise = client.connect();
        mockWs = client.ws;
        await connectPromise;
    });

    afterEach(() => {
        client.disconnect();
    });

    test('connects successfully', () => {
        expect(client.isConnected()).toBe(true);
    });

    test('creates session successfully', async () => {
        const mockSessionId = 'test-session-123';
        mockWs.mockServerResponse(data => {
            const request = JSON.parse(data);
            if (request.type === 'create') {
                mockWs.mockServerMessage(JSON.stringify({
                    response: 'success',
                    id: mockSessionId
                }));
            }
        });

        const sessionId = await client.createSession();
        expect(sessionId).toBe(mockSessionId);
        expect(client.getCurrentSessionId()).toBe(mockSessionId);
    });

    test('joins session successfully', async () => {
        const sessionId = 'existing-session-123';
        mockWs.mockServerResponse(data => {
            const request = JSON.parse(data);
            if (request.type === 'join' && request.id === sessionId) {
                mockWs.mockServerMessage(JSON.stringify({
                    response: 'success',
                    id: sessionId
                }));
            }
        });

        await expect(client.joinSession(sessionId)).resolves.toBe(true);
        expect(client.getCurrentSessionId()).toBe(sessionId);
    });

    test('sends message successfully', async () => {
        // Set up session first
        const sessionId = 'test-session-123';
        client.currentSessionId = sessionId;

        const testMessage = 'Hello, world!';
        mockWs.mockServerResponse(data => {
            const request = JSON.parse(data);
            if (request.type === 'message' &&
                request.id === sessionId &&
                request.payload === testMessage) {
                mockWs.mockServerMessage(JSON.stringify({
                    response: 'success',
                    status: 'sent'
                }));
            }
        });

        await expect(client.sendMessage(testMessage)).resolves.toBe(true);
    });

    test('receives messages correctly', async () => {
        const receivedMessages = [];
        const cleanup = client.onMessage(message => {
            receivedMessages.push(message);
        });

        const testMessage = 'Test message';
        mockWs.mockServerMessage(testMessage);

        expect(receivedMessages).toHaveLength(1);
        expect(receivedMessages[0]).toBe(testMessage);

        cleanup();
    });

    test('handles connection errors', async () => {
        const errorClient = new WebSocketClient();
        const mockError = new Error('Connection failed');

        // Simulate error before connection completes
        const connectPromise = errorClient.connect();
        errorClient.ws.dispatchEvent({
            type: 'error',
            error: mockError
        });

        await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    test('handles message timeouts', async () => {
        // Set up session first
        const sessionId = 'test-session-123';
        client.currentSessionId = sessionId;
        client.timeout = 100; // Short timeout for testing

        const sendPromise = client.sendMessage('test');
        // Don't mock any response, let it timeout

        await expect(sendPromise).rejects.toThrow('Command timeout');
    });

    test('handles invalid session operations', async () => {
        await expect(client.sendMessage('test')).rejects.toThrow('Not in a session');
        await expect(client.leaveSession()).rejects.toThrow('Not in a session');
    });

    test('handles multiple message handlers', async () => {
        const messages1 = [];
        const messages2 = [];

        const cleanup1 = client.onMessage(msg => messages1.push(msg));
        const cleanup2 = client.onMessage(msg => messages2.push(msg));

        const testMessage = 'Test message';
        mockWs.mockServerMessage(testMessage);

        expect(messages1).toHaveLength(1);
        expect(messages2).toHaveLength(1);
        expect(messages1[0]).toBe(testMessage);
        expect(messages2[0]).toBe(testMessage);

        cleanup1();
        cleanup2();
    });

    test('handles cleanup of message handlers', async () => {
        const messages = [];
        const cleanup = client.onMessage(msg => messages.push(msg));

        mockWs.mockServerMessage('First message');
        expect(messages).toHaveLength(1);

        cleanup();

        mockWs.mockServerMessage('Second message');
        expect(messages).toHaveLength(1); // Should still be 1
    });

    test('handles reconnection', async () => {
        client.disconnect();
        expect(client.isConnected()).toBe(false);

        await client.connect();
        expect(client.isConnected()).toBe(true);
    });
});