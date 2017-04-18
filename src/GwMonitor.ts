
import { EventEmitter } from 'events';
import { Gateway } from './Gateway';
import { log } from './Logger';

export class GwMonitor extends EventEmitter {

  gateway: Gateway;
  prefix: string;

  _onMessage: any;
  _onDeviceConnected: any;
  _onDeviceDisconnected: any;
  _onDevicePaired: any;

  constructor(gateway: Gateway, prefix?: string) {
    super();
    
    // Monitor topics prefix
    this.prefix = prefix;
    if(this.prefix == null) this.prefix = 'gw';

    this.gateway = gateway;

    this.gateway.client.subscribe(this.prefix + '/devices/get');
    this.gateway.client.subscribe(this.prefix + '/subscriptions/get');
    this.gateway.client.subscribe(this.prefix + '/topics/get');
    this.gateway.client.subscribe(this.prefix + '/forwarder/enterpair');
    this.gateway.client.subscribe(this.prefix + '/forwarder/exitpair');
    this.gateway.client.subscribe(this.prefix + '/forwarder/mode/get');

    this._onMessage = (topic: string, message: Buffer, packet: any) => this.onMessage(topic, message, packet);
    this._onDeviceConnected = (device: any) => this.onDeviceConnected(device);
    this._onDeviceDisconnected = (device: any) => this.onDeviceDisconnected(device);
    this._onDevicePaired = (device: any) => this.onDevicePaired(device);

    this.gateway.client.on('message', this._onMessage);
    this.gateway.on('deviceConnected', this._onDeviceConnected);
    this.gateway.on('deviceDisconnected', this._onDeviceDisconnected);
    this.gateway.forwarder.on('devicePaired', this._onDevicePaired);

  }

  destructor() {
    this.gateway.client.unsubscribe(this.prefix + '/devices/get');
    this.gateway.client.unsubscribe(this.prefix + '/subscriptions/get');
    this.gateway.client.unsubscribe(this.prefix + '/topics/get');
    this.gateway.client.unsubscribe(this.prefix + '/forwarder/enterpair');
    this.gateway.client.unsubscribe(this.prefix + '/forwarder/exitpair');
    this.gateway.client.unsubscribe(this.prefix + '/forwarder/mode/get');

    this.gateway.client.removeListener('message', this._onMessage);
    this.gateway.removeListener('deviceConnected', this._onDeviceConnected);
    this.gateway.removeListener('deviceDisconnected', this._onDeviceDisconnected);
    this.gateway.forwarder.removeListener('devicePaired', this._onDevicePaired);

    delete this.gateway;
  }

  async onMessage(topic: string, message: Buffer, packet: any) {
    if(topic === this.prefix + '/devices/get') {
      let temp;
      try {
        temp = await this.gateway.db.getAllDevices();
      }
      catch(err) {
        return log.error(err);
      }
      let devices = JSON.parse(JSON.stringify(temp));  // make copy, fixes crash with lokijs
      // Cleanup
      for(let i in devices) {
        delete devices[i].meta;
        delete devices[i].$loki;
      }
      this.gateway.client.publish(this.prefix + '/devices/res', JSON.stringify(devices));
    }

    if(topic === this.prefix + '/subscriptions/get') {
      let temp;
      try {
        temp = await this.gateway.db.getAllSubscriptions();
      }
      catch(err) {
        return log.error(err);
      }
      let subscriptions = JSON.parse(JSON.stringify(temp));  // make copy, fixes crash with lokijs
      // Cleanup
      for(let i in subscriptions) {
        delete subscriptions[i].meta;
        delete subscriptions[i].$loki;
      }
      this.gateway.client.publish(this.prefix + '/subscriptions/res', JSON.stringify(subscriptions));
    }

    if(topic === this.prefix + '/topics/get') {
      let temp;
      try {
        temp = await this.gateway.db.getAllTopics();
      }
      catch(err) {
        return log.error(err);
      }
      let topics = JSON.parse(JSON.stringify(temp));  // make copy, fixes crash with lokijs
      // Cleanup
      for(let i in topics) {
        delete topics[i].meta;
        delete topics[i].$loki;
      }
      this.gateway.client.publish(this.prefix + '/topics/res', JSON.stringify(topics));
    }

    if(topic === this.prefix + '/forwarder/enterpair') {
      this.gateway.forwarder.enterPairMode();
    }

    if(topic === this.prefix + '/forwarder/exitpair') {
      this.gateway.forwarder.exitPairMode();
    }

    if(topic === this.prefix + '/forwarder/mode/get') {
      let mode = this.gateway.forwarder.getMode();
      this.gateway.client.publish(this.prefix + '/forwarder/mode/res', JSON.stringify({ mode: mode }));
    }
  }

  onDeviceConnected(device: any) {
    let dev = JSON.parse(JSON.stringify(device));
    delete dev.meta;
    delete dev.$loki;
    this.gateway.client.publish(this.prefix + '/devices/connected', JSON.stringify(dev));
  }

  onDeviceDisconnected(device: any) {
    let dev = JSON.parse(JSON.stringify(device));
    delete dev.meta;
    delete dev.$loki;
    this.gateway.client.publish(this.prefix + '/devices/disconnected', JSON.stringify(dev));
  }

  onDevicePaired(device: any) {
    let dev = JSON.parse(JSON.stringify(device));
    delete dev.meta;
    delete dev.$loki;
    this.gateway.client.publish(this.prefix + '/devices/paired', JSON.stringify(dev));
  }

}
