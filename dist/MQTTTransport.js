"use strict";
const Slip = require("node-slip");
const events_1 = require("events");
const mqtt = require("mqtt");
const Logger_1 = require("./Logger");
const CrcUtils_1 = require("./CrcUtils");
class MQTTTransport extends events_1.EventEmitter {
    constructor(url, inTopic, outTopic, client) {
        super();
        this.fake = false;
        this.writing = false;
        this.writeBuffer = [];
        this.externalClient = false;
        this.client = null;
        this.url = url;
        this.inTopic = inTopic;
        this.outTopic = outTopic;
        if (client != null) {
            this.externalClient = true;
            this.client = client;
        }
        let receiver = {
            data: (input) => {
                let crcOk = CrcUtils_1.checkCrc(input);
                let data = input.slice(0, input.length - 2);
                if (crcOk) {
                    this.emit("data", data);
                }
                else {
                    this.emit("crcError", data);
                }
            },
            framing: (input) => {
                this.emit("framingError", input);
            },
            escape: (input) => {
                this.emit("escapeError", input);
            }
        };
        this.parser = new Slip.parser(receiver);
    }
    connect() {
        if (this.client == null)
            this.client = mqtt.connect(this.url);
        this.client.on('connect', () => {
            Logger_1.log.debug('Connected to MQTT broker (MQTTTransport)');
            this.client.subscribe(this.outTopic, { qos: 2 });
        });
        this.client.on('offline', () => {
            Logger_1.log.warn('MQTT broker offline (MQTTTransport)');
        });
        this.client.on('reconnect', () => {
            Logger_1.log.warn('Trying to reconnect with MQTT broker (MQTTTransport)');
        });
        this.client.on('message', (topic, message, packet) => {
            if (topic !== this.outTopic)
                return;
            message = Buffer.from(message.toString(), 'base64');
            this.parser.write(message);
        });
        if (this.externalClient || this.client.connected) {
            this.client.subscribe(this.outTopic, { qos: 2 });
            return Promise.resolve(null);
        }
        else {
            return new Promise((resolve, reject) => {
                this.client.once('connect', () => {
                    this.client.subscribe(this.outTopic, { qos: 2 });
                    resolve(null);
                });
            });
        }
    }
    close(callback) {
        if (!callback)
            callback = function () { };
        if (this.client == null || this.externalClient)
            return;
        this.client.end(false, (err) => {
            if (err)
                return callback(err);
            callback();
        });
    }
    write(data) {
        data = new Buffer(data);
        let crc = CrcUtils_1.calcCrc(data);
        let crcBuf = new Buffer(2);
        crcBuf.writeUInt16LE(crc, 0);
        let buffer = Buffer.concat([data, crcBuf]);
        let slipData = Slip.generator(buffer);
        slipData = new Buffer(slipData.toString('base64'));
        this.writeBuffer.push(slipData);
        this.writeNow();
    }
    writeNow() {
        if (this.client == null)
            return;
        if (this.writeBuffer.length <= 0)
            return;
        if (this.writing)
            return;
        this.writing = true;
        if (this.fake) {
            this.writing = false;
            return;
        }
        var data = this.writeBuffer.shift();
        this.client.publish(this.inTopic, data, {
            qos: 2,
            retain: false
        });
        this.writing = false;
        if (this.writeBuffer.length > 0)
            this.writeNow();
    }
}
exports.MQTTTransport = MQTTTransport;

//# sourceMappingURL=MQTTTransport.js.map
