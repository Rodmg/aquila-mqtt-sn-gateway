"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const Device_1 = require("./models/Device");
const Message_1 = require("./models/Message");
const Subscription_1 = require("./models/Subscription");
const Topic_1 = require("./models/Topic");
const db_1 = require("./db");
class GatewayDB {
    constructor(dataPath) {
        let dataDir = path.dirname(dataPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }
        this.dataPath = dataPath;
    }
    destructor() {
    }
    connect() {
        return db_1.setupDB()
            .then(() => {
            return Device_1.Device.update({
                connected: false,
                waitingPingres: false,
                state: 'disconnected'
            }, {
                where: { connected: true }
            });
        });
    }
    setDevice(device) {
        return Promise.resolve(Device_1.Device.findOne({ where: { $or: [{ address: device.address }, { id: device.id }] } })
            .then((result) => {
            if (!result)
                return Device_1.Device.create(device);
            if (device.dataValues != null)
                device = device.dataValues;
            return result.update(device);
        }));
    }
    getDeviceByAddr(addr) {
        return Promise.resolve(Device_1.Device.findOne({ where: { address: addr } }));
    }
    getDeviceById(id) {
        return Promise.resolve(Device_1.Device.findOne({ where: { id: id } }));
    }
    getAllDevices() {
        return Promise.resolve(Device_1.Device.findAll());
    }
    getNextDeviceAddress() {
        return Promise.resolve(Device_1.Device.findAll({ order: [['address', 'ASC']] })
            .then((found) => {
            found = found.map((item) => {
                return item.address;
            });
            let nextIndex = null;
            if (found.length === 0)
                return 1;
            for (let i = 0; i < found.length; i++) {
                let current = found[i];
                let prev = 0;
                if (i != 0)
                    prev = found[i - 1];
                if (current > prev + 1) {
                    nextIndex = prev + 1;
                    return nextIndex;
                }
            }
            nextIndex = found[found.length - 1] + 1;
            if (nextIndex > 0xFE || nextIndex === 0xF0)
                return null;
            return nextIndex;
        }));
    }
    getNextTopicId(deviceId) {
        return Promise.resolve(Topic_1.Topic.findAll({ where: { deviceId: deviceId }, order: [['mqttId', 'ASC']] })
            .then((found) => {
            found = found.map((item) => {
                return item.address;
            });
            let nextIndex = null;
            if (found.length === 0)
                return 1;
            for (let i = 0; i < found.length; i++) {
                let current = found[i];
                let prev = 0;
                if (i != 0)
                    prev = found[i - 1];
                if (current > prev + 1) {
                    nextIndex = prev + 1;
                    return nextIndex;
                }
            }
            nextIndex = found[found.length - 1] + 1;
            if (nextIndex > 0xFF)
                throw new Error("Max topics reached for device");
            return nextIndex;
        }));
    }
    getAllTopics() {
        return Promise.resolve(Topic_1.Topic.findAll());
    }
    setTopic(deviceId, topic, topicId, type) {
        if (type == null)
            type = 'normal';
        return Promise.resolve(Topic_1.Topic.findOne({ where: { deviceId: deviceId, $or: [{ id: topicId }, { name: topic }] } })
            .then((result) => {
            if (!result)
                return this.getNextTopicId(deviceId)
                    .then((nextId) => {
                    return Topic_1.Topic.create({
                        deviceId: deviceId,
                        mqttId: nextId,
                        name: topic,
                        type: type
                    });
                });
            let update = {
                name: topic
            };
            if (type != null)
                update.type = type;
            return result.update(update);
        }));
    }
    getTopic(deviceId, idOrName) {
        let query = {
            where: {
                deviceId: deviceId
            }
        };
        if (idOrName.id !== undefined)
            query.where.id = idOrName.id;
        if (idOrName.mqttId !== undefined)
            query.where.mqttId = idOrName.mqttId;
        if (idOrName.name !== undefined)
            query.where.name = idOrName.name;
        return Promise.resolve(Topic_1.Topic.findOne(query));
    }
    getTopicsFromDevice(deviceId) {
        return Promise.resolve(Topic_1.Topic.findAll({ where: { deviceId: deviceId } }));
    }
    getAllSubscriptions() {
        return Promise.resolve(Subscription_1.Subscription.findAll({ include: [{ model: Topic_1.Topic, as: 'topic' }] }));
    }
    setSubscription(deviceId, topicName, qos) {
        if (qos == null)
            qos = 0;
        let results = {};
        return this.getTopic(deviceId, { name: topicName })
            .then((topic) => {
            if (!topic)
                return this.setTopic(deviceId, topicName);
            return topic;
        })
            .then((topic) => {
            results.topic = topic;
            return Subscription_1.Subscription.findOne({ where: { deviceId: deviceId, topicId: topic.id } });
        })
            .then((subscription) => {
            let sub = {
                deviceId: deviceId,
                topicId: results.topic.id,
                qos: qos
            };
            if (!subscription)
                return Subscription_1.Subscription.create(sub);
            return subscription.update(sub);
        });
    }
    getSubscriptionsFromTopic(topicName) {
        return Promise.resolve(Topic_1.Topic.findOne({ where: { name: topicName }, include: [{
                    model: Subscription_1.Subscription,
                    as: 'subscriptions',
                    include: [{ model: Topic_1.Topic, as: 'topic' }]
                }] })
            .then((result) => {
            if (result == null)
                return [];
            return result.subscriptions;
        }));
    }
    getSubscriptionsFromDevice(deviceId) {
        return Promise.resolve(Device_1.Device.findOne({ where: { id: deviceId }, include: [{
                    model: Subscription_1.Subscription,
                    as: 'subscriptions',
                    include: [{ model: Topic_1.Topic, as: 'topic' }]
                }] })
            .then((result) => {
            if (result == null)
                return [];
            return result.subscriptions;
        }));
    }
    removeSubscriptionsFromDevice(deviceId) {
        return Promise.resolve(Subscription_1.Subscription.destroy({ where: { deviceId: deviceId } }));
    }
    removeSubscription(deviceId, topicName, topicType) {
        return Promise.resolve(Topic_1.Topic.findOne({ where: { name: topicName, deviceId: deviceId, type: topicType } })
            .then((topic) => {
            if (!topic)
                return false;
            return Promise.resolve(Subscription_1.Subscription.destroy({ where: { deviceId: deviceId, topicId: topic.id } }));
        })
            .then((result) => {
            return true;
        }));
    }
    pushMessage(message) {
        return Promise.resolve(Message_1.Message.create(message));
    }
    popMessagesFromDevice(deviceId) {
        if (deviceId == null)
            return Promise.resolve(false);
        let result = [];
        return Promise.resolve(Message_1.Message.findAll({ where: { deviceId: deviceId }, include: [{ model: Topic_1.Topic, as: 'topic' }] })
            .then((messages) => {
            result = messages;
            return Message_1.Message.destroy({ where: { deviceId: deviceId } });
        })
            .then(() => {
            return result;
        }));
    }
}
exports.GatewayDB = GatewayDB;

//# sourceMappingURL=GatewayDB.js.map
