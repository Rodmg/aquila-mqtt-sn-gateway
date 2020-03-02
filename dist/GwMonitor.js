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
class GwMonitor extends events_1.EventEmitter {
    constructor(gateway, prefix) {
        super();
        this.prefix = prefix;
        if (this.prefix == null)
            this.prefix = 'gw';
        this.gateway = gateway;
        this.gateway.client.subscribe(this.prefix + '/devices/get');
        this.gateway.client.subscribe(this.prefix + '/subscriptions/get');
        this.gateway.client.subscribe(this.prefix + '/topics/get');
        this.gateway.client.subscribe(this.prefix + '/forwarder/mode/get');
        this.gateway.client.subscribe(this.prefix + '/devices/req');
        this.gateway.client.subscribe(this.prefix + '/devices/remove/req');
        this.gateway.client.subscribe(this.prefix + '/subscriptions/req');
        this.gateway.client.subscribe(this.prefix + '/topics/req');
        this.gateway.client.subscribe(this.prefix + '/forwarder/mode/req');
        this.gateway.client.subscribe(this.prefix + '/forwarder/enterpair');
        this.gateway.client.subscribe(this.prefix + '/forwarder/exitpair');
        this.gateway.client.subscribe(this.prefix + '/forwarder/mode/get');
        this._onMessage = (topic, message, packet) => this.onMessage(topic, message, packet);
        this._onDeviceConnected = (device) => this.onDeviceConnected(device);
        this._onDeviceDisconnected = (device) => this.onDeviceDisconnected(device);
        this._onDevicePaired = (device) => this.onDevicePaired(device);
        this.gateway.client.on('message', this._onMessage);
        this.gateway.on('deviceConnected', this._onDeviceConnected);
        this.gateway.on('deviceDisconnected', this._onDeviceDisconnected);
        this.gateway.forwarder.on('devicePaired', this._onDevicePaired);
    }
    destructor() {
        this.gateway.client.unsubscribe(this.prefix + '/devices/get');
        this.gateway.client.unsubscribe(this.prefix + '/subscriptions/get');
        this.gateway.client.unsubscribe(this.prefix + '/topics/get');
        this.gateway.client.unsubscribe(this.prefix + '/forwarder/mode/get');
        this.gateway.client.unsubscribe(this.prefix + '/devices/req');
        this.gateway.client.unsubscribe(this.prefix + '/devices/remove/req');
        this.gateway.client.unsubscribe(this.prefix + '/subscriptions/req');
        this.gateway.client.unsubscribe(this.prefix + '/topics/req');
        this.gateway.client.unsubscribe(this.prefix + '/forwarder/mode/req');
        this.gateway.client.unsubscribe(this.prefix + '/forwarder/enterpair');
        this.gateway.client.unsubscribe(this.prefix + '/forwarder/exitpair');
        this.gateway.client.unsubscribe(this.prefix + '/forwarder/mode/get');
        this.gateway.client.removeListener('message', this._onMessage);
        this.gateway.removeListener('deviceConnected', this._onDeviceConnected);
        this.gateway.removeListener('deviceDisconnected', this._onDeviceDisconnected);
        this.gateway.forwarder.removeListener('devicePaired', this._onDevicePaired);
        delete this.gateway;
    }
    onMessage(topic, message, packet) {
        return __awaiter(this, void 0, void 0, function* () {
            if (topic === this.prefix + '/devices/req' || topic === this.prefix + '/devices/get') {
                let temp;
                try {
                    temp = yield this.gateway.db.getAllDevices();
                }
                catch (err) {
                    return Logger_1.log.error(err);
                }
                let devices = JSON.parse(JSON.stringify(temp));
                for (let i in devices) {
                    delete devices[i].meta;
                    delete devices[i].$loki;
                }
                this.gateway.client.publish(this.prefix + '/devices/res', JSON.stringify(devices));
            }
            if (topic === this.prefix + '/devices/remove/req') {
                let result = false;
                let device = null;
                try {
                    device = JSON.parse(message.toString());
                    result = yield this.gateway.db.removeDevice(device);
                }
                catch (err) {
                    Logger_1.log.warn(err);
                    result = false;
                }
                let response = {
                    success: result
                };
                this.gateway.client.publish(this.prefix + '/devices/remove/res', JSON.stringify(response));
            }
            if (topic === this.prefix + '/subscriptions/req' ||
                topic === this.prefix + '/subscriptions/get') {
                let temp;
                try {
                    temp = yield this.gateway.db.getAllSubscriptions();
                }
                catch (err) {
                    return Logger_1.log.error(err);
                }
                let subscriptions = JSON.parse(JSON.stringify(temp));
                for (let i in subscriptions) {
                    delete subscriptions[i].meta;
                    delete subscriptions[i].$loki;
                }
                this.gateway.client.publish(this.prefix + '/subscriptions/res', JSON.stringify(subscriptions));
            }
            if (topic === this.prefix + '/topics/req' || topic === this.prefix + '/topics/get') {
                let temp;
                try {
                    temp = yield this.gateway.db.getAllTopics();
                }
                catch (err) {
                    return Logger_1.log.error(err);
                }
                let topics = JSON.parse(JSON.stringify(temp));
                for (let i in topics) {
                    delete topics[i].meta;
                    delete topics[i].$loki;
                }
                this.gateway.client.publish(this.prefix + '/topics/res', JSON.stringify(topics));
            }
            if (topic === this.prefix + '/forwarder/enterpair') {
                this.gateway.forwarder.enterPairMode();
            }
            if (topic === this.prefix + '/forwarder/exitpair') {
                this.gateway.forwarder.exitPairMode();
            }
            if (topic === this.prefix + '/forwarder/mode/req' ||
                topic === this.prefix + '/forwarder/mode/get') {
                let mode = this.gateway.forwarder.getMode();
                this.gateway.client.publish(this.prefix + '/forwarder/mode/res', JSON.stringify({ mode: mode }));
            }
        });
    }
    onDeviceConnected(device) {
        let dev = JSON.parse(JSON.stringify(device));
        delete dev.meta;
        delete dev.$loki;
        this.gateway.client.publish(this.prefix + '/devices/connected', JSON.stringify(dev));
    }
    onDeviceDisconnected(device) {
        let dev = JSON.parse(JSON.stringify(device));
        delete dev.meta;
        delete dev.$loki;
        this.gateway.client.publish(this.prefix + '/devices/disconnected', JSON.stringify(dev));
    }
    onDevicePaired(device) {
        let dev = JSON.parse(JSON.stringify(device));
        delete dev.meta;
        delete dev.$loki;
        this.gateway.client.publish(this.prefix + '/devices/paired', JSON.stringify(dev));
    }
}
exports.GwMonitor = GwMonitor;

//# sourceMappingURL=GwMonitor.js.map
