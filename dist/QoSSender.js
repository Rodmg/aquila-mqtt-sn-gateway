"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const mqttsn = require("mqttsn-packet");
const MAX_RETRIES = 3;
const TIMEOUT = 1000;
class QoSSender extends events_1.EventEmitter {
    constructor(forwarder) {
        super();
        this.forwarder = forwarder;
        this.msgBuffer = [];
    }
    generateMsgId() {
        let ids = this.msgBuffer.map((item) => {
            return item.msgId;
        });
        ids.sort(function (a, b) { return a - b; });
        let nextIndex = null;
        if (ids.length === 0)
            return 1;
        for (let i = 0; i < ids.length; i++) {
            let current = ids[i];
            let prev = 0;
            if (i != 0)
                prev = ids[i - 1];
            if (current > prev + 1) {
                nextIndex = prev + 1;
                return nextIndex;
            }
        }
        nextIndex = ids[ids.length - 1] + 1;
        if (nextIndex > 0xFFFF)
            throw new Error("Max msgid reached");
        return nextIndex;
    }
    send(addr, message) {
        if (message.qos === 1)
            return this.sendQoS1(addr, message);
        else if (message.qos === 2)
            return this.sendQoS2(addr, message);
        else
            return this.sendQoS0(addr, message);
    }
    sendQoS0(addr, message) {
        let packet = mqttsn.generate({ cmd: 'publish',
            topicIdType: message.topicIdType,
            dup: false,
            qos: message.qos,
            retain: message.retain,
            topicId: message.topicId,
            msgId: 0,
            payload: message.payload });
        this.forwarder.send(addr, packet);
        return Promise.resolve(true);
    }
    sendQoS1(addr, message) {
        let msgId = this.generateMsgId();
        this.msgBuffer.push({
            message: message,
            addr: addr,
            retries: 0,
            msgId: msgId
        });
        return new Promise((resolve, reject) => {
            let resTopic = `puback-${msgId}`;
            let tout = null;
            let confirmCb = (data) => {
                if (tout) {
                    clearTimeout(tout);
                    this.removeListener(resTopic, confirmCb);
                    this.popMsg(msgId);
                    return resolve(true);
                }
            };
            let prepareTimeout = () => {
                tout = setTimeout(() => {
                    tout = null;
                    let msg = this.getMsg(msgId);
                    if (msg.retries >= MAX_RETRIES) {
                        this.removeListener(resTopic, confirmCb);
                        this.popMsg(msgId);
                        return reject(new Error('QOS1 send timeout'));
                    }
                    msg.retries++;
                    prepareTimeout();
                    let packet = mqttsn.generate({ cmd: 'publish',
                        topicIdType: message.topicIdType,
                        dup: true,
                        qos: 1,
                        retain: message.retain,
                        topicId: message.topicId,
                        msgId: msgId,
                        payload: message.payload });
                    this.forwarder.send(addr, packet);
                }, TIMEOUT);
            };
            prepareTimeout();
            this.once(resTopic, confirmCb);
            let packet = mqttsn.generate({ cmd: 'publish',
                topicIdType: message.topicIdType,
                dup: false,
                qos: 1,
                retain: message.retain,
                topicId: message.topicId,
                msgId: msgId,
                payload: message.payload });
            this.forwarder.send(addr, packet);
        });
    }
    sendQoS2(addr, message) {
        let msgId = this.generateMsgId();
        this.msgBuffer.push({
            message: message,
            addr: addr,
            retries: 0,
            msgId: msgId
        });
        return new Promise((resolve, reject) => {
            let resTopic = `pubrec-${msgId}`;
            let tout = null;
            let confirmCb = (data) => {
                if (tout) {
                    clearTimeout(tout);
                    this.removeListener(resTopic, confirmCb);
                    this.popMsg(msgId);
                    let frame = mqttsn.generate({ cmd: 'pubrel', msgId: msgId });
                    this.forwarder.send(addr, frame);
                    return resolve(true);
                }
            };
            let prepareTimeout = () => {
                tout = setTimeout(() => {
                    tout = null;
                    let msg = this.getMsg(msgId);
                    if (msg.retries >= MAX_RETRIES) {
                        this.removeListener(resTopic, confirmCb);
                        this.popMsg(msgId);
                        return reject(new Error('QOS2 send timeout'));
                    }
                    msg.retries++;
                    prepareTimeout();
                    let packet = mqttsn.generate({ cmd: 'publish',
                        topicIdType: message.topicIdType,
                        dup: true,
                        qos: 2,
                        retain: message.retain,
                        topicId: message.topicId,
                        msgId: msgId,
                        payload: message.payload });
                    this.forwarder.send(addr, packet);
                }, TIMEOUT);
            };
            prepareTimeout();
            this.once(resTopic, confirmCb);
            let packet = mqttsn.generate({ cmd: 'publish',
                topicIdType: message.topicIdType,
                dup: false,
                qos: 2,
                retain: message.retain,
                topicId: message.topicId,
                msgId: msgId,
                payload: message.payload });
            this.forwarder.send(addr, packet);
        });
    }
    getMsg(msgId) {
        for (let msg of this.msgBuffer) {
            if (msg.msgId === msgId)
                return msg;
        }
        return null;
    }
    popMsg(msgId) {
        for (let msg of this.msgBuffer) {
            if (msg.msgId === msgId) {
                var i = this.msgBuffer.indexOf(msg);
                if (i != -1) {
                    this.msgBuffer.splice(i, 1);
                }
                console.log(this.msgBuffer);
                return msg;
            }
        }
        return null;
    }
    attendPuback(addr, packet) {
        let msgId = packet.msgId;
        console.log('puback', msgId);
        this.emit(`puback-${msgId}`, packet);
    }
    attendPubrec(addr, packet) {
        let msgId = packet.msgId;
        console.log('pubrec', msgId);
        this.emit(`pubrec-${msgId}`, packet);
    }
    attendPubcomp(addr, packet) {
        let msgId = packet.msgId;
        console.log('pubcomp', msgId);
        this.emit(`pubcomp-${msgId}`, packet);
    }
}
exports.QoSSender = QoSSender;

//# sourceMappingURL=QoSSender.js.map
