// jest.setup.js
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;

        // Use setTimeout to simulate async connection
        setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) this.onopen();
        }, 0);
    }

    addEventListener(type, listener) {
        if (!this._listeners) this._listeners = {};
        if (!this._listeners[type]) this._listeners[type] = new Set();
        this._listeners[type].add(listener);
    }

    removeEventListener(type, listener) {
        if (!this._listeners?.[type]) return;
        this._listeners[type].delete(listener);
    }

    dispatchEvent(event) {
        const type = event.type;
        if (this[`on${type}`]) {
            this[`on${type}`](event);
        }
        if (this._listeners?.[type]) {
            this._listeners[type].forEach(listener => listener(event));
        }
    }

    send(data) {
        if (this.readyState !== MockWebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }
        if (this._mockServerCallback) {
            this._mockServerCallback(data);
        }
    }

    close() {
        this.readyState = MockWebSocket.CLOSING;
        if (this.onclose) {
            this.onclose();
        }
        this.readyState = MockWebSocket.CLOSED;
    }

    // Test helper methods
    mockServerMessage(data) {
        this.dispatchEvent({
            type: 'message',
            data: data
        });
    }

    mockServerResponse(callback) {
        this._mockServerCallback = callback;
    }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

global.WebSocket = MockWebSocket;