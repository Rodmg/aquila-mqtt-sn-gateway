"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const Logger_1 = require("./Logger");
const ACKTIMEOUT = 5000;
const MAX_BUFFER_ALLOWED = 10;
const NACK_CMD = 0x00;
const ACK_CMD = 0x01;
const CONFIG_CMD = 0x02;
const PAIR_CMD = 0x03;
const NO_KEY = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
class Forwarder extends events_1.EventEmitter {
    constructor(db, transport, pan, encryptionKey) {
        super();
        this.readyToSend = true;
        this.frameBuffer = [];
        this.ackTimeout = null;
        this.pan = 0x01;
        this.key = NO_KEY;
        this.pairMode = false;
        this.db = db;
        this.transport = transport;
        if (pan != null)
            this.pan = pan;
        if (encryptionKey != null) {
            if (encryptionKey.length !== 16)
                Logger_1.log.warn("Invalid encryption key received, starting without encryption");
            else
                this.key = encryptionKey;
        }
    }
    connect() {
        this.transport.on('error', (err) => {
            Logger_1.log.error("There was an error connecting to the Bridge, make sure it's connected to the computer.");
            throw err;
        });
        this.transport.on('disconnect', (err) => {
            Logger_1.log.error("The Bridge was disconnected from the computer.");
            throw err;
        });
        this.transport.on('data', (data) => {
            if (this.pairMode)
                return this.handlePairMode(data);
            if (data.length < 4)
                return Logger_1.log.error('Forwarder: got message with not enough data');
            let lqi = data[0];
            let rssi = data[1];
            let len = data[2];
            let msgType = data[3];
            if (msgType !== 0xFE) {
                if (msgType === NACK_CMD) {
                    this.readyToSend = true;
                    clearTimeout(this.ackTimeout);
                    this.sendNow();
                }
                else if (msgType === ACK_CMD) {
                    this.readyToSend = true;
                    clearTimeout(this.ackTimeout);
                    this.sendNow();
                }
                else if (msgType === CONFIG_CMD) {
                    Logger_1.log.trace("GOT CONFIG");
                    this.sendConfig();
                    this.sendNow();
                }
                else
                    return Logger_1.log.error('Forwarder: bad forwarder msg type');
                return;
            }
            if (data.length < 7)
                return Logger_1.log.error('Forwarder: got message with not enough data');
            let ctrl = data[4];
            let addr = data.readUInt16LE(5);
            let mqttsnFrame = data.slice(7);
            if (addr === 0 && !this.pairMode)
                return;
            let message = {
                lqi: lqi,
                rssi: rssi,
                len: len,
                msgType: msgType,
                ctrl: ctrl,
                addr: addr,
                mqttsnFrame: mqttsnFrame
            };
            this.emit('data', message);
        });
        this.transport.on('crcError', (data) => Logger_1.log.error('crcError', data));
        this.transport.on('framingError', (data) => Logger_1.log.error('framingError', data));
        this.transport.on('escapeError', (data) => Logger_1.log.error('escapeError', data));
        return this.transport.connect()
            .then(() => {
            setTimeout(() => {
                setTimeout(() => this.sendConfig(), 2100);
            }, 100);
            return null;
        });
    }
    disconnect() {
        this.transport.removeAllListeners('data');
        this.transport.removeAllListeners('crcError');
        this.transport.removeAllListeners('framingError');
        this.transport.removeAllListeners('escapeError');
        this.transport.close();
        delete this.transport;
        delete this.db;
    }
    enterPairMode() {
        this.pairMode = true;
        let frame = new Buffer([3, 0x03, 0x01]);
        this.frameBuffer.push(frame);
        this.sendNow();
    }
    exitPairMode() {
        this.pairMode = false;
        let frame = new Buffer([3, 0x03, 0x00]);
        this.frameBuffer.push(frame);
        this.sendNow();
    }
    getMode() {
        return this.pairMode ? 'pair' : 'normal';
    }
    handlePairMode(data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (data.length < 4)
                return Logger_1.log.error('Forwarder: got message with not enough data');
            let lqi = data[0];
            let rssi = data[1];
            let len = data[2];
            let msgType = data[3];
            if (msgType !== 0x03) {
                if (msgType === 0x00) {
                    this.readyToSend = true;
                    clearTimeout(this.ackTimeout);
                    this.sendNow();
                }
                else if (msgType === 0x01) {
                    this.readyToSend = true;
                    clearTimeout(this.ackTimeout);
                    this.sendNow();
                }
                else
                    return Logger_1.log.error('Forwarder: bad forwarder msg type');
                return;
            }
            if (data.length < 10)
                return Logger_1.log.error('Forwarder: got message with not enough data');
            let ctrl = data[4];
            if (ctrl !== 0x02)
                return Logger_1.log.error('Forwarder: bad message');
            let addr = data.readUInt16LE(5);
            if (addr !== 0)
                return Logger_1.log.error('Forwarder: bad address for pair mode');
            let paircmd = data[8];
            if (paircmd !== PAIR_CMD)
                return Logger_1.log.warn("Bad cmd on pair message");
            let randomId = data[9];
            let newAddr;
            try {
                newAddr = yield this.db.getNextDeviceAddress();
            }
            catch (err) {
                return Logger_1.log.error("Error getting next device address from DB.", err);
            }
            if (newAddr == null || isNaN(newAddr))
                return Logger_1.log.warn("WARNING: Max registered devices reached...");
            let device = {
                address: newAddr,
                connected: false,
                state: 'disconnected',
                waitingPingres: false,
                lqi: 0,
                rssi: 0,
                duration: 10,
                lastSeen: new Date(),
                willTopic: null,
                willMessage: null,
                willQoS: null,
                willRetain: null
            };
            try {
                yield this.db.setDevice(device);
            }
            catch (err) {
                return Logger_1.log.error("Error saving Device to DB.", err);
            }
            let frame = Buffer.from([7, 0x03, 0x03, 0x00, 0x00, 21, 0x03, randomId, newAddr, this.pan]);
            let key = Buffer.from(this.key);
            frame = Buffer.concat([frame, key]);
            this.frameBuffer.push(frame);
            this.sendNow();
            this.exitPairMode();
            this.emit("devicePaired", device);
        });
    }
    send(addr, packet) {
        if (this.pairMode)
            return false;
        if (this.frameBuffer.length >= MAX_BUFFER_ALLOWED) {
            Logger_1.log.trace('Forwarder buffer full, packet dropped');
            this.sendNow();
            return false;
        }
        let addrL = (addr) & 0xFF;
        let addrH = (addr >> 8) & 0xFF;
        let frame = new Buffer([5, 0xFE, 1, addrL, addrH]);
        frame = Buffer.concat([frame, packet]);
        this.frameBuffer.push(frame);
        this.sendNow();
        return true;
    }
    sendNow() {
        if (!this.readyToSend)
            return;
        let frame = this.frameBuffer.shift();
        if (typeof (frame) === 'undefined')
            return;
        this.readyToSend = false;
        this.transport.write(frame);
        this.ackTimeout = setTimeout(() => {
            this.readyToSend = true;
            this.sendNow();
        }, ACKTIMEOUT);
    }
    sendConfig() {
        let frame = Buffer.from([19, CONFIG_CMD, this.pan]);
        let key = Buffer.from(this.key);
        frame = Buffer.concat([frame, key]);
        Logger_1.log.trace("Sending config:", frame);
        this.frameBuffer.push(frame);
        this.sendNow();
    }
}
exports.Forwarder = Forwarder;

//# sourceMappingURL=Forwarder.js.map
