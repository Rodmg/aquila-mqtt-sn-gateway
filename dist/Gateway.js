"use strict";
const events_1 = require("events");
const mqttsn = require("mqttsn-packet");
const mqtt = require("mqtt");
const Logger_1 = require("./Logger");
const parser = mqttsn.parser();
const TADV = 15 * 60;
const NADV = 3;
const TSEARCHGW = 5;
const TGWINFO = 5;
const TWAIT = 5 * 60;
const TRETRY = 15;
const NRETRY = 5;
const GWID = 0x00FF;
const MAXLEN = 100;
const KASERVINTERVAL = 1000;
const DURATION_TOLERANCE = 5000;
const DURATION_FACTOR = 1;
const SEND_PINGREQ = true;
const PINGRES_TOUT = 1000;
const ALLOW_SLEEP_RECONNECT = true;
const ALLOW_LOST_RECONNECT_ON_PING = true;
class Gateway extends events_1.EventEmitter {
    constructor(db, forwarder, client) {
        super();
        this.client = null;
        this.externalClient = false;
        this.allowUnknownDevices = true;
        this.keepAliveInterval = null;
        this.advertiseInterval = null;
        this.db = db;
        this.forwarder = forwarder;
        if (client != null) {
            this.externalClient = true;
            this.client = client;
        }
    }
    destructor() {
        clearInterval(this.keepAliveInterval);
        clearInterval(this.advertiseInterval);
        this.forwarder.disconnect();
        if (this.client == null || this.externalClient)
            return;
        this.client.end(false, (err) => {
            if (err)
                return Logger_1.log.error(err);
        });
    }
    init(mqttUrl, allowUnknownDevices) {
        this.allowUnknownDevices = allowUnknownDevices;
        this.forwarder.on('data', (data) => {
            let addr = data.addr;
            let packet = parser.parse(data.mqttsnFrame);
            if (packet == null)
                return Logger_1.log.debug("Bad mqttsn frame");
            Logger_1.log.debug('Got from forwarder:', packet);
            this.updateKeepAlive(addr, packet, data.lqi, data.rssi);
            if (packet.cmd === 'searchgw')
                this.attendSearchGW(addr, packet);
            if (packet.cmd === 'connect')
                this.attendConnect(addr, packet, data);
            if (packet.cmd === 'disconnect')
                this.attendDisconnect(addr, packet, data);
            if (packet.cmd === 'pingreq')
                this.attendPingReq(addr, packet, data);
            if (packet.cmd === 'pingresp')
                this.attendPingResp(addr, packet);
            if (packet.cmd === 'subscribe')
                this.attendSubscribe(addr, packet);
            if (packet.cmd === 'unsubscribe')
                this.attendUnsubscribe(addr, packet);
            if (packet.cmd === 'publish')
                this.attendPublish(addr, packet);
            if (packet.cmd === 'register')
                this.attendRegister(addr, packet);
            if (packet.cmd === 'willtopic')
                this.attendWillTopic(addr, packet);
            if (packet.cmd === 'willmsg')
                this.attendWillMsg(addr, packet);
            if (packet.cmd === 'willtopicupd')
                this.attendWillTopicUpd(addr, packet);
            if (packet.cmd === 'willmsgupd')
                this.attendWillMsgUpd(addr, packet);
            if (packet.cmd === 'pubrel')
                this.emit(addr + '/pubrel/' + packet.msgId);
            if (packet.cmd === 'pubrec')
                this.respondQoS2PubRec(addr, packet);
        });
        parser.on('error', (error) => {
            Logger_1.log.error('mqtt-sn parser error:', error);
        });
        return this.forwarder.connect()
            .then(() => {
            Logger_1.log.debug('Connected to Bridge');
            return this.connectMqtt(mqttUrl);
        })
            .then(() => {
            this.advertise();
            this.advertiseInterval = setInterval(() => this.advertise(), TADV * 1000);
            this.keepAliveInterval = setInterval(() => {
                this.keepAliveService();
            }, KASERVINTERVAL);
        });
    }
    advertise() {
        let frame = mqttsn.generate({ cmd: 'advertise', gwId: GWID, duration: TADV });
        this.forwarder.send(0xFFFF, frame);
        Logger_1.log.trace("Advertising...");
    }
    subscribeSavedTopics() {
        let subs = this.db.getAllSubscriptions();
        for (let i = 0; i < subs.length; i++) {
            this.client.subscribe(subs[i].topic, { qos: subs[i].qos });
        }
    }
    connectMqtt(url) {
        if (this.client == null)
            this.client = mqtt.connect(url);
        this.client.on('connect', () => {
            Logger_1.log.debug('Connected to MQTT broker');
            this.subscribeSavedTopics();
        });
        this.client.on('offline', () => {
            Logger_1.log.warn('MQTT broker offline');
        });
        this.client.on('reconnect', () => {
            Logger_1.log.warn('Trying to reconnect with MQTT broker');
        });
        this.client.on('message', (topic, message, packet) => {
            if (message.length > MAXLEN)
                return Logger_1.log.warn("message too long");
            let subs = this.db.getSubscriptionsFromTopic(topic);
            for (let i in subs) {
                let topic = this.db.getTopic({ id: subs[i].device }, { name: subs[i].topic });
                if (!topic)
                    continue;
                let device = this.db.getDeviceById(subs[i].device);
                if (!device)
                    continue;
                if (!device.connected)
                    continue;
                if (device.state === 'asleep') {
                    Logger_1.log.trace("Got message for sleeping device, buffering");
                    this.db.pushMessage({
                        device: device.id,
                        message: message,
                        dup: packet.dup,
                        retain: packet.retain,
                        qos: subs[i].qos,
                        topicId: topic.id,
                        msgId: packet.messageId,
                        topicIdType: 'normal'
                    });
                    continue;
                }
                let frame = mqttsn.generate({ cmd: 'publish',
                    topicIdType: 'normal',
                    dup: packet.dup,
                    qos: subs[i].qos,
                    retain: packet.retain,
                    topicId: topic.id,
                    msgId: packet.messageId,
                    payload: message });
                this.forwarder.send(device.address, frame);
            }
        });
        if (this.externalClient || this.client.connected) {
            this.subscribeSavedTopics();
            return Promise.resolve(null);
        }
        else {
            return new Promise((resolve, reject) => {
                this.client.once('connect', () => {
                    resolve(null);
                });
            });
        }
    }
    isDeviceConnected(addr) {
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return false;
        return device.connected;
    }
    updateKeepAlive(addr, packet, lqi, rssi) {
        let device = this.db.getDeviceByAddr(addr);
        if (!device) {
            Logger_1.log.trace('Unknown device, addr:', addr);
            return;
        }
        if (device.connected) {
            device.lastSeen = new Date();
            device.lqi = lqi;
            device.rssi = rssi;
            this.db.setDevice(device);
        }
    }
    keepAliveService() {
        let devices = this.db.getAllDevices();
        for (let i in devices) {
            if (devices[i].connected) {
                let now = (new Date()).getTime();
                if (now - devices[i].lastSeen > (devices[i].duration * 1000 * DURATION_FACTOR + DURATION_TOLERANCE)) {
                    if (SEND_PINGREQ) {
                        if (!devices[i].waitingPingres) {
                            Logger_1.log.trace("Sending pingreq to", devices[i].address);
                            devices[i].waitingPingres = true;
                            this.db.setDevice(devices[i]);
                            let frame = mqttsn.generate({ cmd: 'pingreq' });
                            this.forwarder.send(devices[i].address, frame);
                        }
                        else if (devices[i].lastSeen > (devices[i].duration * 1000 * DURATION_FACTOR + DURATION_TOLERANCE) + PINGRES_TOUT) {
                            devices[i].connected = false;
                            devices[i].waitingPingres = false;
                            devices[i].state = 'lost';
                            this.db.setDevice(devices[i]);
                            this.publishLastWill(devices[i]);
                            this.emit("deviceDisconnected", devices[i]);
                            Logger_1.log.debug("Device disconnected, address:", devices[i].address);
                        }
                    }
                    else {
                        devices[i].connected = false;
                        devices[i].state = 'lost';
                        this.db.setDevice(devices[i]);
                        this.publishLastWill(devices[i]);
                        this.emit("deviceDisconnected", devices[i]);
                        Logger_1.log.debug("Device disconnected, address:", devices[i].address);
                    }
                }
            }
        }
    }
    publishLastWill(device) {
        if (!device.willTopic)
            return;
        this.client.publish(device.willTopic, device.willMessage, {
            qos: device.willQoS,
            retain: device.willRetain
        });
    }
    attendSearchGW(addr, packet) {
        Logger_1.log.trace('searchgw duration:', packet.duration);
        let frame = mqttsn.generate({ cmd: 'gwinfo', gwId: GWID });
        this.forwarder.send(addr, frame);
    }
    attendConnect(addr, packet, data) {
        let device = this.db.getDeviceByAddr(addr);
        if (!device) {
            if (!this.allowUnknownDevices) {
                let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Rejected: not supported' });
                this.forwarder.send(addr, frame);
                return;
            }
            device = {
                address: addr,
                connected: true,
                state: 'active',
                waitingPingres: false,
                lqi: data.lqi,
                rssi: data.rssi,
                duration: packet.duration,
                lastSeen: new Date(),
                willTopic: null,
                willMessage: null,
                willQoS: null,
                willRetain: null
            };
        }
        else {
            device.connected = true;
            device.state = 'active';
            device.lqi = data.lqi;
            device.rssi = data.rssi;
            device.duration = packet.duration;
            device.lastSeen = new Date();
        }
        if (packet.cleanSession) {
            device.willTopic = null;
            device.willMessage = null;
            device.willQoS = null;
            device.willRetain = null;
            this.db.removeSubscriptionsFromDevice({ address: addr });
        }
        this.db.setDevice(device);
        if (packet.will)
            return this.requestWillTopic(addr);
        let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
        this.forwarder.send(addr, frame);
        this.emit("deviceConnected", device);
    }
    attendDisconnect(addr, packet, data) {
        let duration = packet.duration;
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return;
        Logger_1.log.trace("Got Disconnect, duration:", duration);
        let wasDisconnected = false;
        if (duration) {
            if (!ALLOW_SLEEP_RECONNECT && !device.connected)
                return;
            device.duration = duration;
            if (!device.connected)
                wasDisconnected = true;
            device.connected = true;
            device.lastSeen = new Date();
            device.lqi = data.lqi;
            device.rssi = data.rssi;
            device.state = 'asleep';
        }
        else {
            device.connected = false;
            device.state = 'disconnected';
        }
        this.db.setDevice(device);
        let frame = mqttsn.generate({ cmd: 'disconnect' });
        this.forwarder.send(addr, frame);
        if (!duration)
            this.emit("deviceDisconnected", device);
        if (!(duration == null) && wasDisconnected)
            this.emit("deviceConnected", device);
    }
    attendPingReq(addr, packet, data) {
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return;
        if (device.connected && device.state === 'asleep') {
            Logger_1.log.trace("Got Ping from sleeping device");
            device.state = 'awake';
            let messages = this.db.popMessagesFromDevice(device.id);
            Logger_1.log.trace("Buffered messages for sleeping device:", messages);
            for (let i in messages) {
                try {
                    if (messages[i].message.data != null) {
                        messages[i].message = new Buffer(messages[i].message.data);
                    }
                    let frame = mqttsn.generate({ cmd: 'publish',
                        topicIdType: messages[i].topicIdType,
                        dup: messages[i].dup,
                        qos: messages[i].qos,
                        retain: messages[i].retain,
                        topicId: messages[i].topicId,
                        msgId: messages[i].msgId,
                        payload: messages[i].message });
                    this.forwarder.send(device.address, frame);
                }
                catch (err) {
                    Logger_1.log.error(err);
                }
            }
            device.state = 'asleep';
        }
        else if (!device.connected && device.state === 'lost' && ALLOW_LOST_RECONNECT_ON_PING) {
            Logger_1.log.trace('Reconnecting lost device via Ping');
            device.connected = true;
            device.state = 'active';
            device.lqi = data.lqi;
            device.rssi = data.rssi;
            device.lastSeen = new Date();
            this.db.setDevice(device);
            this.emit("deviceConnected", device);
        }
        else if (!device.connected)
            return;
        let frame = mqttsn.generate({ cmd: 'pingresp' });
        this.forwarder.send(addr, frame);
    }
    attendPingResp(addr, packet) {
        Logger_1.log.trace("Got Ping response from", addr);
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return;
        device.waitingPingres = false;
        this.db.setDevice(device);
    }
    attendSubscribe(addr, packet) {
        let qos = packet.qos;
        let topicIdType = packet.topicIdType;
        let msgId = packet.msgId;
        let topicName;
        if (!this.isDeviceConnected(addr))
            return;
        if (topicIdType == null)
            return Logger_1.log.warn("Invalid topicIdType on subscribe");
        if (topicIdType === 'pre-defined')
            topicName = packet.topicId;
        else
            topicName = packet.topicName;
        if (topicName == null)
            return Logger_1.log.warn("Invalid topicName on subscribe");
        let subscription = this.db.setSubscription({ address: addr }, { name: topicName }, qos);
        let topicInfo = this.db.getTopic({ address: addr }, { name: topicName });
        if (!topicInfo)
            topicInfo = this.db.setTopic({ address: addr }, topicName, null);
        let frame = mqttsn.generate({ cmd: 'suback', qos: qos, topicId: topicInfo.id, msgId: msgId, returnCode: 'Accepted' });
        this.forwarder.send(addr, frame);
        setTimeout(() => {
            this.client.subscribe(topicName, { qos: qos });
        }, 500);
    }
    attendUnsubscribe(addr, packet) {
        let topicIdType = packet.topicIdType;
        let msgId = packet.msgId;
        let topicName;
        if (!this.isDeviceConnected(addr))
            return;
        if (topicIdType === 'pre-defined')
            topicName = packet.topicId;
        else
            topicName = packet.topicName;
        this.db.removeSubscription({ address: addr }, topicName, topicIdType);
        let frame = mqttsn.generate({ cmd: 'unsuback', msgId: msgId });
        this.forwarder.send(addr, frame);
    }
    attendPublish(addr, packet) {
        let qos = packet.qos;
        let retain = packet.retain;
        let topicIdType = packet.topicIdType;
        let topicId = packet.topicId;
        let msgId = packet.msgId;
        let payload = packet.payload;
        if (!this.isDeviceConnected(addr))
            return;
        let topicInfo = this.db.getTopic({ address: addr }, { id: topicId });
        if (!topicInfo) {
            let frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Rejected: invalid topic ID' });
            this.forwarder.send(addr, frame);
            return Logger_1.log.warn("Attend publish: Unknown topic id");
        }
        this.client.publish(topicInfo.name, payload, { qos: qos, retain: retain }, (err) => {
            if (err) {
                Logger_1.log.error("Publish error:", err);
                let frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Rejected: congestion' });
                this.forwarder.send(addr, frame);
                return;
            }
            if (qos === 1) {
                let frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Accepted' });
                this.forwarder.send(addr, frame);
            }
            else if (qos === 2) {
                let frame = mqttsn.generate({ cmd: 'pubrec', msgId: msgId });
                this.forwarder.send(addr, frame);
                var self = this;
                function onPubRel() {
                    let frame = mqttsn.generate({ cmd: 'pubcomp', msgId: msgId });
                    self.forwarder.send(addr, frame);
                }
                this.once(addr + '/pubrel/' + msgId, onPubRel);
                setTimeout(() => {
                    this.removeListener(addr + '/pubrel/' + msgId, onPubRel);
                }, TRETRY * 1000);
            }
        });
    }
    respondQoS2PubRec(addr, packet) {
        let msgId = packet.msgId;
        let frame = mqttsn.generate({ cmd: 'pubrel', msgId: msgId });
        this.forwarder.send(addr, frame);
    }
    attendRegister(addr, packet) {
        let msgId = packet.msgId;
        let topicName = packet.topicName;
        if (!this.isDeviceConnected(addr))
            return;
        let topicInfo = this.db.getTopic({ address: addr }, { name: topicName });
        if (!topicInfo)
            topicInfo = this.db.setTopic({ address: addr }, topicName, null);
        let frame = mqttsn.generate({ cmd: 'regack', topicId: topicInfo.id, returnCode: 'Accepted' });
        this.forwarder.send(addr, frame);
    }
    requestWillTopic(addr) {
        let frame = mqttsn.generate({ cmd: 'willtopicreq' });
        this.forwarder.send(addr, frame);
    }
    attendWillTopic(addr, packet) {
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return Logger_1.log.warn("Unknown device trying to register will topic");
        device.willQoS = packet.qos;
        device.willRetain = packet.retain;
        device.willTopic = packet.willTopic;
        this.db.setDevice(device);
        this.requestWillMsg(addr);
    }
    requestWillMsg(addr) {
        let frame = mqttsn.generate({ cmd: 'willmsgreq' });
        this.forwarder.send(addr, frame);
    }
    attendWillMsg(addr, packet) {
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return Logger_1.log.warn("Unknown device trying to register will msg");
        device.willMessage = packet.willMsg;
        this.db.setDevice(device);
        let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
        this.forwarder.send(addr, frame);
        this.emit("deviceConnected", device);
    }
    attendWillTopicUpd(addr, packet) {
        if (!this.isDeviceConnected(addr))
            return;
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return Logger_1.log.warn("Unknown device trying to update will topic");
        if (!packet.willTopic) {
            device.willQoS = null;
            device.willRetain = null;
            device.willTopic = null;
            device.willMessage = null;
        }
        else {
            device.willQoS = packet.qos;
            device.willRetain = packet.retain;
            device.willTopic = packet.willTopic;
        }
        this.db.setDevice(device);
        let frame = mqttsn.generate({ cmd: 'willtopicresp', returnCode: 'Accepted' });
        this.forwarder.send(addr, frame);
    }
    attendWillMsgUpd(addr, packet) {
        if (!this.isDeviceConnected(addr))
            return;
        let device = this.db.getDeviceByAddr(addr);
        if (!device)
            return Logger_1.log.warn("Unknown device trying to update will msg");
        device.willMessage = packet.willMsg;
        this.db.setDevice(device);
        let frame = mqttsn.generate({ cmd: 'willmsgresp', returnCode: 'Accepted' });
        this.forwarder.send(addr, frame);
    }
}
exports.Gateway = Gateway;

//# sourceMappingURL=Gateway.js.map
