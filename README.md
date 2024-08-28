Complete with installation instructions and usage code snippets:

```markdown
# DhanWebSocket

DhanWebSocket is a Node.js library for connecting to the Dhan WebSocket API. This library allows you to receive real-time stock data, manage subscriptions, and handle various types of market data including quotes and open interest (OI).

## Installation

Install the package using npm:

```bash
npm i dhanhq_node
```

## Usage

### Import the Library

```javascript
import DhanWebSocket from 'dhan-websocket';
```

### Initialize and Connect

```javascript
const clientId = 'yourClientId';
const accessToken = 'yourAccessToken';

const dhanWs = new DhanWebSocket(clientId, accessToken);

dhanWs.connect()
  .then(() => {
    console.log('Connected and authorized to Dhan WebSocket.');
    
    // Subscribe to instruments
    dhanWs.subscribe([
      [1, '12018'],  // Exchange Segment and Security ID
      [1, '9599']
    ]);
  })
  .catch((err) => {
    console.error('Connection failed:', err.message);
  });

dhanWs.on('process-data', (data) => {
  console.log('Received data:', data);
});
```

### Subscribe to Instruments

```javascript
const instruments = [
  [1, '12018'],  // NSE Segment, Security ID for the instrument
  [1, '9599']
];

dhanWs.subscribe(instruments);
```

### Unsubscribe from Instruments

```javascript
dhanWs.unsubscribe(instruments);
```

### Event Handling

You can handle various events such as receiving data, errors, and disconnections.

```javascript
dhanWs.on('process-data', (data) => {
  console.log('Received data:', data);
});

dhanWs.on('disconnection', (data) => {
  console.error('Disconnected:', data.message);
});
```

### Fetching Last Traded Price (LTP)

You can retrieve the last traded price (LTP) for a specific instrument:

```javascript
const securityId = '12018';
const ltp = dhanWs.getLastTradedPrice(securityId);
console.log(`Last Traded Price for ${securityId}:`, ltp);
```

## Error Handling

Make sure to handle WebSocket errors and reconnections in case of network issues.

```javascript
dhanWs.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

dhanWs.on('close', () => {
  console.log('WebSocket closed. Attempting to reconnect...');
  dhanWs.connect();  // Reconnect logic
});
```

## License

MIT
```

This `README.md` provides an overview of the package, installation instructions, and code examples that show how to use your `DhanWebSocket` class effectively.