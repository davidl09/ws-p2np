const WebSocket = require('ws');
const crypto = require('crypto');

class ProtocolTester {
    constructor(serverUrl = 'ws://localhost:8080/ws') {
        this.serverUrl = serverUrl;
        this.timeout = 5000;
    }

    createWebSocket() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.serverUrl);
            ws.on('open', () => resolve(ws));
            ws.on('error', (error) => reject(new Error(`WebSocket connection failed: ${error.message}`)));
        });
    }

    async sendAndReceive(ws, data, expectJson = true) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Response timeout for message: ${JSON.stringify(data)}`));
            }, this.timeout);

            const messageHandler = (message) => {
                clearTimeout(timeout);
                const messageStr = message.toString();
                if (expectJson) {
                    try {
                        const response = JSON.parse(messageStr);
                        resolve(response);
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON response: ${e.message}`));
                    }
                } else {
                    resolve(messageStr);
                }
            };

            const errorHandler = (error) => {
                clearTimeout(timeout);
                reject(new Error(`WebSocket error: ${error.message}`));
            };

            ws.once('message', messageHandler);
            ws.once('error', errorHandler);

            try {
                ws.send(JSON.stringify(data));
            } catch (e) {
                clearTimeout(timeout);
                ws.removeListener('message', messageHandler);
                ws.removeListener('error', errorHandler);
                reject(new Error(`Failed to send message: ${e.message}`));
            }
        });
    }

    async expectMessage(ws) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Message receive timeout'));
            }, this.timeout);

            const messageHandler = (message) => {
                clearTimeout(timeout);
                resolve(message.toString());
            };

            ws.once('message', messageHandler);
        });
    }

    async waitForClose(ws) {
        return new Promise((resolve) => {
            ws.on('close', resolve);
            ws.close();
        });
    }

    generateRandomMessage(size) {
        return crypto.randomBytes(size).toString('hex');
    }

    async createManyWebSockets(count) {
        const connections = [];
        for (let i = 0; i < count; i++) {
            try {
                const ws = await this.createWebSocket();
                connections.push(ws);
            } catch (error) {
                console.error(`Failed to create connection ${i}: ${error.message}`);
            }
        }
        return connections;
    }
}

describe('WebSocket Protocol Tests', () => {
    const tester = new ProtocolTester();

    beforeEach(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('basic protocol validation', async () => {
        const ws = await tester.createWebSocket();
        try {
            // Test missing type
            let response = await tester.sendAndReceive(ws, {});
            expect(response).toEqual({
                response: 'bad_message',
                reason: "missing key 'type'"
            });

            // Test invalid type
            response = await tester.sendAndReceive(ws, { type: 'invalid_type' });
            expect(response).toEqual({
                response: 'bad_message',
                reason: 'unknown key invalid_type'
            });
        } finally {
            await tester.waitForClose(ws);
        }
    });

    test('session creation', async () => {
        const ws = await tester.createWebSocket();
        try {
            const response = await tester.sendAndReceive(ws, { type: 'create' });
            expect(response.response).toBe('success');
            expect(response).toHaveProperty('id');
            expect(typeof response.id).toBe('string');
        } finally {
            await tester.waitForClose(ws);
        }
    });

    test('session joining scenarios', async () => {
        // Test 1: Missing ID scenario
        const ws1 = await tester.createWebSocket();
        try {
            const joinNoIdResponse = await tester.sendAndReceive(ws1, { type: 'join' });
            expect(joinNoIdResponse).toEqual({
                response: 'bad_request',
                reason: "missing key 'id'"
            });
        } finally {
            await tester.waitForClose(ws1);
        }

        // Test 2: Non-existent session scenario
        const ws2 = await tester.createWebSocket();
        try {
            const joinBadIdResponse = await tester.sendAndReceive(ws2, {
                type: 'join',
                id: 'nonexistent'
            });
            expect(joinBadIdResponse).toEqual({
                response: 'bad_request',
                reason: 'session not found'
            });
        } finally {
            await tester.waitForClose(ws2);
        }

        // Test 3: Successful join and duplicate join scenario
        const wsCreator = await tester.createWebSocket();
        let sessionId;
        try {
            const createResponse = await tester.sendAndReceive(wsCreator, { type: 'create' });
            sessionId = createResponse.id;

            const wsJoiner = await tester.createWebSocket();
            try {
                // Test successful join
                const joinResponse = await tester.sendAndReceive(wsJoiner, {
                    type: 'join',
                    id: sessionId
                });
                expect(joinResponse).toEqual({
                    response: 'success',
                    id: sessionId
                });

                // Test joining same session again (should fail)
                const joinAgainResponse = await tester.sendAndReceive(wsJoiner, {
                    type: 'join',
                    id: sessionId
                });
                expect(joinAgainResponse).toEqual({
                    response: 'error',
                    reason: 'user already in session'
                });
            } finally {
                await tester.waitForClose(wsJoiner);
            }
        } finally {
            await tester.waitForClose(wsCreator);
        }
    });

    test('messaging scenarios', async () => {
        const ws1 = await tester.createWebSocket();
        const ws2 = await tester.createWebSocket();
        let sessionId;

        try {
            // Create session with first client
            const createResponse = await tester.sendAndReceive(ws1, { type: 'create' });
            sessionId = createResponse.id;

            // Join with second client
            await tester.sendAndReceive(ws2, {
                type: 'join',
                id: sessionId
            });

            // Test missing id
            let response = await tester.sendAndReceive(ws1, {
                type: 'message',
                payload: 'test'
            });
            expect(response).toEqual({
                response: 'bad_request',
                reason: "missing key 'id'"
            });

            // Test missing payload
            response = await tester.sendAndReceive(ws1, {
                type: 'message',
                id: sessionId
            });
            expect(response).toEqual({
                response: 'bad_request',
                reason: "missing key 'payload'"
            });

            // Test messaging to non-existent session
            response = await tester.sendAndReceive(ws1, {
                type: 'message',
                id: 'nonexistent',
                payload: 'test'
            });
            expect(response).toEqual({
                response: 'bad_request',
                reason: 'session not found'
            });

            // Test successful message sending
            const messagePromise = tester.expectMessage(ws2);
            const testMessage = 'Hello, session!';
            response = await tester.sendAndReceive(ws1, {
                type: 'message',
                id: sessionId,
                payload: testMessage
            });
            expect(response).toEqual({
                response: 'success',
                status: 'sent'
            });

            // Verify second client received the message
            const receivedMessage = await messagePromise;
            expect(receivedMessage).toBe(testMessage);

            // Test sending message from non-member
            const ws3 = await tester.createWebSocket();
            try {
                response = await tester.sendAndReceive(ws3, {
                    type: 'message',
                    id: sessionId,
                    payload: 'test'
                });
                expect(response).toEqual({
                    response: 'bad_request',
                    reason: `user not in session ${sessionId}`
                });
            } finally {
                await tester.waitForClose(ws3);
            }
        } finally {
            await tester.waitForClose(ws1);
            await tester.waitForClose(ws2);
        }
    });

    test('invalid JSON', async () => {
        const ws = await tester.createWebSocket();
        try {
            const response = await new Promise((resolve) => {
                ws.once('message', (message) => {
                    resolve(JSON.parse(message.toString()));
                });
                ws.send('{invalid json}');
            });

            expect(response.response).toBe('bad_message');
            expect(response).toHaveProperty('reason');
        } finally {
            await tester.waitForClose(ws);
        }
    });
});

describe('Stress Tests', () => {
    const tester = new ProtocolTester();
    tester.timeout = 10000; // Increased timeout for stress tests

    test('rapid message sending', async () => {
        const ws1 = await tester.createWebSocket();
        const ws2 = await tester.createWebSocket();
        let sessionId;

        try {
            const createResponse = await tester.sendAndReceive(ws1, { type: 'create' });
            sessionId = createResponse.id;

            // Join with second client
            await tester.sendAndReceive(ws2, {
                type: 'join',
                id: sessionId
            });

            const messageCount = 100;
            const receivedMessages = new Set();

            // Set up collector for received messages
            ws2.on('message', (message) => {
                receivedMessages.add(message.toString());
            });

            // Send all messages as fast as possible
            const sendPromises = [];
            for (let i = 0; i < messageCount; i++) {
                sendPromises.push(tester.sendAndReceive(ws1, {
                    type: 'message',
                    id: sessionId,
                    payload: `Rapid message ${i}`
                }));
            }

            // Wait for all sends to complete
            const responses = await Promise.all(sendPromises);
            for (const response of responses) {
                expect(response).toEqual({
                    response: 'success',
                    status: 'sent'
                });
            }

            // Give some time for all messages to arrive
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify we received all messages
            expect(receivedMessages.size).toBe(messageCount);
            for (let i = 0; i < messageCount; i++) {
                expect(receivedMessages.has(`Rapid message ${i}`)).toBe(true);
            }

        } finally {
            await tester.waitForClose(ws1);
            await tester.waitForClose(ws2);
        }
    }, 30000);

    test('large messages', async () => {
        const ws1 = await tester.createWebSocket();
        const ws2 = await tester.createWebSocket();
        let sessionId;

        try {
            const createResponse = await tester.sendAndReceive(ws1, { type: 'create' });
            sessionId = createResponse.id;

            await tester.sendAndReceive(ws2, {
                type: 'join',
                id: sessionId
            });

            const sizes = [1024, 10240, 102400]; // 1KB, 10KB, 100KB
            for (const size of sizes) {
                const largePayload = tester.generateRandomMessage(size);
                const messagePromise = tester.expectMessage(ws2);

                const response = await tester.sendAndReceive(ws1, {
                    type: 'message',
                    id: sessionId,
                    payload: largePayload
                });

                expect(response).toEqual({
                    response: 'success',
                    status: 'sent'
                });

                const receivedMessage = await messagePromise;
                expect(receivedMessage).toBe(largePayload);
            }
        } finally {
            await tester.waitForClose(ws1);
            await tester.waitForClose(ws2);
        }
    }, 30000);

    test('multiple clients per session', async () => {
        const wsCreator = await tester.createWebSocket();
        let sessionId;

        try {
            const createResponse = await tester.sendAndReceive(wsCreator, { type: 'create' });
            sessionId = createResponse.id;

            const clientCount = 10;
            const clients = await tester.createManyWebSockets(clientCount);
            const messageReceivers = new Map();

            try {
                // Have all clients join
                const joinPromises = clients.map(ws =>
                    tester.sendAndReceive(ws, {
                        type: 'join',
                        id: sessionId
                    })
                );

                const joinResponses = await Promise.all(joinPromises);
                for (const response of joinResponses) {
                    expect(response.response).toBe('success');
                }

                // Set up message receivers for all clients
                for (const client of clients) {
                    messageReceivers.set(client, []);
                }

                // Have each client send a message and track received messages
                for (let i = 0; i < clients.length; i++) {
                    const sender = clients[i];
                    const message = `Message from client ${i}`;

                    // Set up receive promises for all other clients
                    const receivePromises = clients
                        .filter(client => client !== sender)
                        .map(client => tester.expectMessage(client));

                    // Send the message
                    const response = await tester.sendAndReceive(sender, {
                        type: 'message',
                        id: sessionId,
                        payload: message
                    });
                    expect(response).toEqual({
                        response: 'success',
                        status: 'sent'
                    });

                    // Wait for all receives
                    const receivedMessages = await Promise.all(receivePromises);
                    receivedMessages.forEach(msg => {
                        expect(msg).toBe(message);
                    });
                }
            } finally {
                await Promise.all(clients.map(ws => tester.waitForClose(ws)));
            }
        } finally {
            await tester.waitForClose(wsCreator);
        }
    }, 30000);
});