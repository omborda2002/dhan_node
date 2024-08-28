/* eslint-disable no-undef */
import WebSocket from "ws";
import EventEmitter from "events";

class DhanWebSocket extends EventEmitter {
  constructor(clientId, accessToken) {
    super();
    this.clientId = clientId;
    this.accessToken = accessToken;
    this.websocketUrl = "wss://api-feed.dhan.co";
    this.ws = null;
    this.isAuthorized = false;
    this.connectionPromise = null;
    this.tickerData = {}; 
  }

  connect() {
    this.connectionPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.websocketUrl);

      this.ws.on("open", async () => {
        console.log("WebSocket connected.");
        this.isConnected = true;

        this.isAuthorized = await this.authorize();
        if (this.isAuthorized) {
          console.log("Authorization successful");
          resolve();
        } else {
          console.log("Authorization failed");
          reject(new Error("Authorization failed"));
        }
      });

      this.ws.on("message", (buffer) => {
        const data = this.processData(buffer);
        this.emit("process-data", data);
      });

      this.ws.on("error", (err) => {
        console.error("WebSocket error:", err.message);
        reject(err);
      });

      this.ws.on("close", () => {
        console.log("WebSocket disconnected.");
        this.isConnected = false;
        this.isAuthorized = false;
      });
    });

    return this.connectionPromise;
  }

  async waitForConnection() {
    if (!this.connectionPromise) {
      throw new Error("Connection not initiated. Call connect() first.");
    }
    await this.connectionPromise;
  }

  async authorize() {
    try {
      const apiAccessToken = Buffer.alloc(500, 0);
      Buffer.from(this.accessToken, "utf-8").copy(apiAccessToken);

      const authenticationType = Buffer.from("2P", "utf-8");
      const payload = Buffer.concat([apiAccessToken, authenticationType]);

      const feedRequestCode = 11;
      const messageLength =
        83 + apiAccessToken.length + authenticationType.length;

      const clientIdBuffer = Buffer.alloc(30, 0);
      Buffer.from(this.clientId, "utf-8").copy(clientIdBuffer);

      const dhanAuth = Buffer.alloc(50, 0);

      const header = Buffer.alloc(83);
      header.writeInt8(feedRequestCode, 0);
      header.writeUInt16LE(messageLength, 1);
      clientIdBuffer.copy(header, 3);
      dhanAuth.copy(header, 33);

      const authorizationPacket = Buffer.concat([header, payload]);

      this.ws.send(authorizationPacket);

      return true;
    } catch (e) {
      console.error(`Authorization failed: ${e}`);
      return false;
    }
  }

  processData(data) {
    const buffer = Buffer.from(data);

    if (buffer.length < 1) {
      console.error("Insufficient data length for determining message type");
      return null;
    }

    const messageType = buffer.readUInt8(0);

    switch (messageType) {
      case 4:
        return this.processQuote(buffer);
      case 5:
        return this.processOI(buffer);
      case 50:
        return this.processServerDisconnection(buffer);
      default:
        console.log(`Unknown message type: ${messageType}`);
        return { type: "Unknown", data: buffer.toString("hex") };
    }
  }

  async subscribe(instruments) {
    await this.waitForConnection();
    const feedRequestCode = 17;
    const subscriptionPacket = this.createSubscriptionPacket(
      instruments,
      feedRequestCode
    );
    this.ws.send(subscriptionPacket);
  }

  async unsubscribe(instruments) {
    await this.waitForConnection();
    const feedRequestCode = 18;
    const subscriptionPacket = this.createSubscriptionPacket(
      instruments,
      feedRequestCode
    );
    this.ws.send(subscriptionPacket);
  }

  createSubscriptionPacket(instruments, feedRequestCode) {
    const numInstruments = instruments.length;
    const headerLength = 83 + 4;
    const instrumentPacketLength = numInstruments * 21;
    const messageLength = headerLength + instrumentPacketLength;

    const header = this.createHeader(feedRequestCode, messageLength);

    const numInstrumentsBytes = Buffer.alloc(4);
    numInstrumentsBytes.writeUInt32LE(numInstruments, 0);

    let instrumentInfo = Buffer.alloc(2100);
    let offset = 0;
    instruments.forEach(([exchangeSegment, securityId]) => {
      instrumentInfo.writeUInt8(exchangeSegment, offset);
      offset += 1;

      instrumentInfo.write(securityId, offset, 20, "utf8");
      offset += 20;
    });

    for (let i = numInstruments; i < 100; i++) {
      instrumentInfo.writeUInt8(0, offset);
      offset += 1;
      instrumentInfo.fill(0, offset, offset + 20);
      offset += 20;
    }

    return Buffer.concat([header, numInstrumentsBytes, instrumentInfo]);
  }

  createHeader(feedRequestCode, messageLength) {
    const dhanAuth = Buffer.alloc(50);
    const clientIdBytes = Buffer.from(this.clientId, "utf8");

    const header = Buffer.alloc(83);
    header.writeInt8(feedRequestCode, 0);
    header.writeUInt16LE(messageLength, 1);
    clientIdBytes.copy(header, 3);
    dhanAuth.copy(header, 33);

    return header;
  }

  processQuote(data) {
    const buffer = Buffer.from(data);

    if (buffer.length < 50) {
      console.error("Insufficient data length for quote processing");
      return null;
    }

    const unpackQuote = [
      buffer.readUInt8(0),
      buffer.readUInt16LE(1),
      buffer.readUInt8(3),
      buffer.readUInt32LE(4),
      buffer.readFloatLE(8),
      buffer.readUInt16LE(12),
      buffer.readUInt32LE(14),
      buffer.readFloatLE(18),
      buffer.readUInt32LE(22),
      buffer.readUInt32LE(26),
      buffer.readUInt32LE(30),
      buffer.readFloatLE(34),
      buffer.readFloatLE(38),
      buffer.readFloatLE(42),
      buffer.readFloatLE(46),
    ];

    const quoteData = {
      type: "Quote",
      exchange_segment: unpackQuote[2],
      security_id: unpackQuote[3],
      LTP: unpackQuote[4].toFixed(2),
      LTQ: unpackQuote[5],
      LTT: this.utcTime(unpackQuote[6]),
      avg_price: unpackQuote[7].toFixed(2),
      volume: unpackQuote[8],
      total_sell_quantity: unpackQuote[9],
      total_buy_quantity: unpackQuote[10],
      open: unpackQuote[11].toFixed(2),
      close: unpackQuote[12].toFixed(2),
      high: unpackQuote[13].toFixed(2),
      low: unpackQuote[14].toFixed(2),
    };

    // Update or add LTP to tickerData
    this.updateTickerData(quoteData.security_id, quoteData);

    return quoteData;
  }

  processOI(data) {
    const buffer = Buffer.from(data);

    if (buffer.length < 12) {
      console.error("Insufficient data length for OI processing");
      return null;
    }

    const unpackOI = [
      buffer.readUInt8(0),
      buffer.readUInt16LE(1),
      buffer.readUInt8(3),
      buffer.readUInt32LE(4),
      buffer.readUInt32LE(8),
    ];

    return {
      type: "OI Data",
      exchange_segment: unpackOI[2],
      security_id: unpackOI[3],
      OI: unpackOI[4],
    };
  }

  processServerDisconnection(buffer) {
    if (buffer.length < 10) {
      console.error(
        "Insufficient data length for server disconnection message"
      );
      return null;
    }

    // '<BHBIH' format
    const messageType = buffer.readUInt8(0);
    const messageLength = buffer.readUInt16LE(1);
    const exchangeSegment = buffer.readUInt8(3);
    const securityId = buffer.readUInt32LE(4);
    const disconnectionCode = buffer.readUInt16LE(8);

    let message = "Disconnected: ";
    let onClose = false;

    switch (disconnectionCode) {
      case 805:
        message += "No. of active websocket connections exceeded";
        onClose = true;
        break;
      case 806:
        message += "Subscribe to Data APIs to continue";
        onClose = true;
        break;
      case 807:
        message += "Access Token is expired";
        onClose = true;
        break;
      case 808:
        message += "Invalid Client ID";
        onClose = true;
        break;
      case 809:
        message += "Authentication Failed - check";
        onClose = true;
        break;
      default:
        message += `Unknown disconnection code: ${disconnectionCode}`;
    }

    this.isConnected = false;
    this.isAuthorized = false;

    // Trigger the onClose event if needed
    if (onClose && this.onClose) {
      this.onClose();
    }

    const resp = {
      type: "ServerDisconnection",
      messageType,
      messageLength,
      exchangeSegment,
      securityId,
      disconnectionCode,
      message,
      onClose,
    };

    this.emit("disconnection", resp);

    return resp;
  }

  utcTime(epochTime) {
    const date = new Date(epochTime * 1000);
    return date.toUTCString().split(" ")[4];
  }

  updateTickerData(securityId, newData) {
    this.tickerData[securityId] = newData;
  }

  getLastTradedPrice(securityId) {
    return this.tickerData[securityId]?.LTP || 0;
  }
}

export default DhanWebSocket;