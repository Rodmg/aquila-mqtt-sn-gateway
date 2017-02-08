"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const loki = require("lokijs");
const path = require("path");
const fs = require("fs");
class GatewayDB {
    constructor(dataPath) {
        this.deviceIndex = 1;
        this.topicIndex = 1;
        let dataDir = path.dirname(dataPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }
        this.dataPath = dataPath;
    }
    destructor() {
        this.db.close(() => {
        });
    }
    connect() {
        return new Promise((resolve, reject) => {
            this.db = new loki(this.dataPath, {
                autosave: true,
                autosaveInterval: 60000,
                autoload: true,
                autoloadCallback: () => this.loadHandler(resolve)
            });
        });
    }
    loadHandler(resolve) {
        this.devices = this.db.getCollection('devices');
        if (this.devices === null)
            this.devices = this.db.addCollection('devices');
        this.devices.findAndUpdate(() => { return true; }, (device) => {
            device.connected = false;
            device.waitingPingres = false;
            device.state = 'disconnected';
            return device;
        });
        this.topics = this.db.getCollection('topics');
        if (this.topics === null)
            this.topics = this.db.addCollection('topics');
        this.subscriptions = this.db.getCollection('subscriptions');
        if (this.subscriptions === null)
            this.subscriptions = this.db.addCollection('subscriptions');
        this.messages = this.db.getCollection('messages');
        if (this.messages === null)
            this.messages = this.db.addCollection('messages');
        process.on('SIGINT', () => {
            this.db.close(() => {
                console.log("closed");
                process.exit();
            });
        });
        this.deviceIndex = this.devices.maxId + 1;
        this.topicIndex = this.topics.maxId + 1;
        return resolve(null);
    }
    setDevice(device) {
        let found = null;
        if (device.address !== undefined)
            found = this.devices.findOne({ address: device.address });
        else if (device.id !== undefined)
            found = this.devices.findOne({ id: device.id });
        if (!found) {
            if (!device.id) {
                device.id = this.deviceIndex;
                this.deviceIndex++;
            }
            this.devices.insert(device);
        }
        else {
            if (device.address !== undefined)
                found.address = device.address;
            if (device.id !== undefined)
                found.id = device.id;
            if (device.connected !== undefined)
                found.connected = device.connected;
            if (device.waitingPingres !== undefined)
                found.waitingPingres = device.waitingPingres;
            if (device.lqi !== undefined)
                found.lqi = device.lqi;
            if (device.rssi !== undefined)
                found.rssi = device.rssi;
            if (device.duration !== undefined)
                found.duration = device.duration;
            if (device.willTopic !== undefined)
                found.willTopic = device.willTopic;
            if (device.willMessage !== undefined)
                found.willMessage = device.willMessage;
            this.devices.update(found);
        }
        return Promise.resolve(found);
    }
    getDeviceByAddr(addr) {
        let found = this.devices.findOne({ address: addr });
        return Promise.resolve(found);
    }
    getDeviceById(id) {
        let found = this.devices.findOne({ id: id });
        return Promise.resolve(found);
    }
    getAllDevices() {
        let found = this.devices.find();
        return Promise.resolve(found);
    }
    getNextDeviceAddress() {
        let found = this.devices.chain().find()
            .simplesort('address').data()
            .map((item) => {
            return item.address;
        });
        let nextIndex = null;
        if (found.length === 0)
            return Promise.resolve(1);
        for (let i = 0; i < found.length; i++) {
            let current = found[i];
            let prev = 0;
            if (i != 0)
                prev = found[i - 1];
            if (current > prev + 1) {
                nextIndex = prev + 1;
                return Promise.resolve(nextIndex);
            }
        }
        nextIndex = found[found.length - 1] + 1;
        if (nextIndex > 0xFE || nextIndex === 0xF0)
            return Promise.resolve(null);
        return Promise.resolve(nextIndex);
    }
    getAllTopics() {
        let found = this.topics.find();
        return Promise.resolve(found);
    }
    setTopic(deviceIdOrAddress, topic, topicId, type) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof (type) === 'undefined' || type === null)
                type = 'normal';
            if (deviceIdOrAddress.id === undefined) {
                if (deviceIdOrAddress.address === undefined)
                    return Promise.resolve(false);
                let dev = yield this.getDeviceByAddr(deviceIdOrAddress.address);
                if (dev)
                    deviceIdOrAddress.id = dev.id;
                if (deviceIdOrAddress.id == null)
                    return Promise.resolve(false);
            }
            let found = this.topics.findOne({ '$and': [{ device: deviceIdOrAddress.id }, { id: topicId }] });
            if (!found) {
                if (!topicId) {
                    topicId = this.topicIndex;
                    this.topicIndex++;
                }
                found = {
                    device: deviceIdOrAddress.id,
                    name: topic,
                    id: topicId,
                    type: type
                };
                this.topics.insert(found);
            }
            else {
                found.device = deviceIdOrAddress.id;
                found.name = topic;
                found.id = topicId;
                found.type = type;
                this.topics.update(found);
            }
            return Promise.resolve(found);
        });
    }
    getTopic(deviceIdOrAddress, idOrName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (deviceIdOrAddress.id === undefined) {
                if (deviceIdOrAddress.address === undefined)
                    return Promise.resolve(false);
                let dev = yield this.getDeviceByAddr(deviceIdOrAddress.address);
                if (dev)
                    deviceIdOrAddress.id = dev.id;
                if (deviceIdOrAddress.id == null)
                    return Promise.resolve(false);
            }
            let query = { '$and': [{ device: deviceIdOrAddress.id }] };
            if (idOrName.id !== undefined)
                query.$and.push({ id: idOrName.id });
            if (idOrName.name !== undefined)
                query.$and.push({ name: idOrName.name });
            let found = this.topics.findOne(query);
            return Promise.resolve(found);
        });
    }
    getTopicsFromDevice(deviceIdOrAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            if (deviceIdOrAddress.id === undefined) {
                if (deviceIdOrAddress.address === undefined)
                    return Promise.resolve(false);
                let dev = yield this.getDeviceByAddr(deviceIdOrAddress.address);
                if (dev)
                    deviceIdOrAddress.id = dev.id;
                if (deviceIdOrAddress.id == null)
                    return Promise.resolve(false);
            }
            let query = { device: deviceIdOrAddress.id };
            let found = this.topics.find(query);
            return Promise.resolve(found);
        });
    }
    getAllSubscriptions() {
        let found = this.subscriptions.find();
        return Promise.resolve(found);
    }
    setSubscription(deviceIdOrAddress, topicIdOrName, qos) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof (qos) === 'undefined' || qos === null)
                qos = 0;
            if (deviceIdOrAddress.id === undefined) {
                if (deviceIdOrAddress.address === undefined)
                    return Promise.resolve(false);
                let dev = yield this.getDeviceByAddr(deviceIdOrAddress.address);
                if (dev)
                    deviceIdOrAddress.id = dev.id;
                if (deviceIdOrAddress.id == null)
                    return Promise.resolve(false);
            }
            if (topicIdOrName.name === undefined) {
                if (topicIdOrName.id === undefined)
                    return Promise.resolve(false);
                let topic = yield this.getTopic({ id: deviceIdOrAddress.id }, { id: topicIdOrName.id });
                topicIdOrName.name = topic.name;
            }
            let found = this.subscriptions.findOne({ '$and': [{ device: deviceIdOrAddress.id }, { topic: topicIdOrName.name }] });
            if (!found) {
                found = {
                    device: deviceIdOrAddress.id,
                    topic: topicIdOrName.name,
                    qos: qos
                };
                this.subscriptions.insert(found);
            }
            else {
                found.device = deviceIdOrAddress.id;
                found.topic = topicIdOrName.name;
                found.qos = qos;
                this.subscriptions.update(found);
            }
            return Promise.resolve(found);
        });
    }
    getSubscriptionsFromTopic(topicName) {
        let found = this.subscriptions.find({ topic: topicName });
        return Promise.resolve(found);
    }
    getSubscriptionsFromDevice(deviceIdOrAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            if (deviceIdOrAddress.id === undefined) {
                if (deviceIdOrAddress.address === undefined)
                    return Promise.resolve(false);
                let dev = yield this.getDeviceByAddr(deviceIdOrAddress.address);
                if (dev)
                    deviceIdOrAddress.id = dev.id;
                if (deviceIdOrAddress.id == null)
                    return Promise.resolve(false);
            }
            let found = this.subscriptions.find({ device: deviceIdOrAddress.id });
            return Promise.resolve(found);
        });
    }
    removeSubscriptionsFromDevice(deviceIdOrAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            if (deviceIdOrAddress.id === undefined) {
                if (deviceIdOrAddress.address === undefined)
                    return Promise.resolve(false);
                let dev = yield this.getDeviceByAddr(deviceIdOrAddress.address);
                if (dev)
                    deviceIdOrAddress.id = dev.id;
                if (deviceIdOrAddress.id == null)
                    return Promise.resolve(false);
            }
            this.subscriptions.removeWhere({ device: deviceIdOrAddress.id });
            return Promise.resolve(true);
        });
    }
    removeSubscription(deviceIdOrAddress, topicName, topicType) {
        return __awaiter(this, void 0, void 0, function* () {
            if (deviceIdOrAddress.id === undefined) {
                if (deviceIdOrAddress.address === undefined)
                    return Promise.resolve(false);
                let dev = yield this.getDeviceByAddr(deviceIdOrAddress.address);
                if (dev)
                    deviceIdOrAddress.id = dev.id;
                if (deviceIdOrAddress.id == null)
                    return Promise.resolve(false);
            }
            this.subscriptions.removeWhere({ '$and': [{ device: deviceIdOrAddress.id },
                    { topic: topicName }] });
            return Promise.resolve(true);
        });
    }
    pushMessage(message) {
        this.messages.insert(message);
        return Promise.resolve(true);
    }
    popMessagesFromDevice(deviceId) {
        if (typeof (deviceId) === 'undefined' || deviceId === null)
            return Promise.resolve(false);
        let messages = this.messages.find({ device: deviceId });
        this.messages.removeWhere({ device: deviceId });
        return Promise.resolve(messages);
    }
}
exports.GatewayDB = GatewayDB;

//# sourceMappingURL=GatewayDB.js.map
