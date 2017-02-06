
import * as loki from 'lokijs';
import * as path from'path';
import * as fs from'fs';
import { DBInterface } from './interfaces';

export class GatewayDB implements DBInterface {

  // Device and topic id pools
  // Start from 1, protocol implementation in device interpreets 0 as null
  deviceIndex: number = 1;
  topicIndex: number = 1;
  db: Loki;

  devices: LokiCollection<any>;
  topics: LokiCollection<any>;
  subscriptions: LokiCollection<any>;
  messages: LokiCollection<any>;

  dataPath: string;

  constructor(dataPath: string) {
    // Create directory if not exists
    let dataDir = path.dirname(dataPath)
    if(!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    this.dataPath = dataPath;
  }

  destructor() {
    this.db.close(() => {
      });
  }

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.db = new loki(this.dataPath, {
        autosave: true,
        autosaveInterval: 60000,
        autoload: true,
        autoloadCallback: () => this.loadHandler(resolve)
      });
    }); 
  }

  loadHandler(resolve: Function) {

    // devices:
    //  address: number
    //  id: string
    //  connected: bool
    //  state: string ('active', 'asleep', 'lost', 'awake', 'disconnected') (for sleep support)
    //  waitingPingres: bool
    //  lqi: number
    //  rssi: number
    //  duration: connect ping timeout
    //  lastSeen: last seen time
    //  willTopic: string
    //  willMessage: string
    //  willQoS
    //  willRetain
    this.devices = this.db.getCollection('devices');
    if(this.devices === null) this.devices = this.db.addCollection('devices');

    // Mark all devices as disconnected and waitingPingres: false on startup
    this.devices.findAndUpdate(() => { return true; }, (device) => {
        device.connected = false;
        device.waitingPingres = false;
        device.state = 'disconnected';
        return device;
      });

    // topics:
    //  device: id
    //  name: string
    //  id: topicId
    //  type: string ('short name', 'normal', 'pre-defined')
    this.topics = this.db.getCollection('topics');
    if(this.topics === null) this.topics = this.db.addCollection('topics');

    // subscriptions:
    //  device: id
    //  topic: string   // Should connect with topic name in topics, if not preexistent, create
    //  qos: qos number
    this.subscriptions = this.db.getCollection('subscriptions');
    if(this.subscriptions === null) this.subscriptions = this.db.addCollection('subscriptions');

    // buffered messages
    //  device: id
    //  message: buffer
    //  dup: bool
    //  retain: bool
    //  qos: number
    //  topicId: number
    //  msgId: number
    //  topicIdType: string
    this.messages = this.db.getCollection('messages');
    if(this.messages === null) this.messages = this.db.addCollection('messages');

    process.on('SIGINT', () => {
        this.db.close(() => {
            console.log("closed");
            process.exit();
          });
      });

    // Updating indexes
    this.deviceIndex = this.devices.maxId + 1;
    this.topicIndex = this.topics.maxId + 1;

    return resolve(null);
  }

  // update or create, use for adding wills etc.
  setDevice(device) {
    let found = null; 
    if(device.address !== undefined) found = this.devices.findOne({ address: device.address });
    else if(device.id !== undefined) found = this.devices.findOne({ id: device.id });
    if(!found) {
      // create new
      if(!device.id) {
        device.id = this.deviceIndex;
        this.deviceIndex++;
      }
      this.devices.insert(device);
    }
    else {
      // update
      if(device.address !== undefined) found.address = device.address;
      if(device.id !== undefined) found.id = device.id;
      if(device.connected !== undefined) found.connected = device.connected;
      if(device.waitingPingres !== undefined) found.waitingPingres = device.waitingPingres;
      if(device.lqi !== undefined) found.lqi = device.lqi;
      if(device.rssi !== undefined) found.rssi = device.rssi;
      if(device.duration !== undefined) found.duration = device.duration;
      if(device.willTopic !== undefined) found.willTopic = device.willTopic;
      if(device.willMessage !== undefined) found.willMessage = device.willMessage;
      this.devices.update(found);
    }
    return found;
  }

  getDeviceByAddr(addr: number) {
    let found = this.devices.findOne({ address: addr });
    return found;
  }

  getDeviceById(id: number) {
    let found = this.devices.findOne({ id: id });
    return found;
  }

  getAllDevices() {
    let found = this.devices.find();
    return found;
  }

  getNextDeviceAddress() {
    // Get all devices and order by address
    let found = this.devices.chain().find()
      .simplesort('address').data()
      .map((item) => {
          return item.address;
        });

    let nextIndex = null;

    // Special case when there are no previous devices registered
    if(found.length === 0) return 1;

    // Find lower unused address
    for(let i = 0; i < found.length; i++) {
      let current = found[i];
      let prev = 0;
      if(i != 0) prev = found[i - 1];
      if(current > prev + 1) {
        // Found discontinuity, return next value inside discontinuity
        nextIndex = prev + 1;
        return nextIndex;
      }
    }
    // If we reached here, there is no discontinuity, return next value if available
    nextIndex = found[found.length - 1] + 1;
    // Forbidden addresses, 0xF0 is the bridge
    if(nextIndex > 0xFE || nextIndex === 0xF0) return null;
    return nextIndex;
  }

  getAllTopics() {
    let found = this.topics.find();
    return found;
  }

  // accepts id or address as object {id: bla} or {address: bla}
  setTopic(deviceIdOrAddress: any, topic: string, topicId?: number, type?: string) {
    if(typeof(type) === 'undefined' || type === null ) type = 'normal';  // default

    if(deviceIdOrAddress.id === undefined) {
      if(deviceIdOrAddress.address === undefined) return false;
      let dev = this.getDeviceByAddr(deviceIdOrAddress.address);
      if(dev) deviceIdOrAddress.id = dev.id;
      if(deviceIdOrAddress.id == null) return false;
    }

    let found = this.topics.findOne({ '$and': [{ device: deviceIdOrAddress.id }, { id: topicId }] });

    if(!found) {
      if(!topicId) {
        topicId = this.topicIndex;
        this.topicIndex++;
      }
      found = {
        device: deviceIdOrAddress.id,
        name: topic,
        id: topicId,
        type: type
      }
      this.topics.insert(found);
    }
    else {
      found.device = deviceIdOrAddress.id;
      found.name = topic;
      found.id = topicId;
      found.type = type;
      this.topics.update(found);
    }

    return found;
  }

  // {id: } or {name:}
  getTopic(deviceIdOrAddress: any, idOrName: any) {
    if(deviceIdOrAddress.id === undefined) {
      if(deviceIdOrAddress.address === undefined) return false;
      let dev = this.getDeviceByAddr(deviceIdOrAddress.address);
      if(dev) deviceIdOrAddress.id = dev.id;
      if(deviceIdOrAddress.id == null) return false;
    }

    let query: any = { '$and': [ {device: deviceIdOrAddress.id} ] };
    if(idOrName.id !== undefined) query.$and.push({ id: idOrName.id });
    if(idOrName.name !== undefined) query.$and.push({ name: idOrName.name });

    let found = this.topics.findOne(query);
    return found;
  }

  getTopicsFromDevice(deviceIdOrAddress: any) {
    if(deviceIdOrAddress.id === undefined) {
      if(deviceIdOrAddress.address === undefined) return false;
      let dev = this.getDeviceByAddr(deviceIdOrAddress.address);
      if(dev) deviceIdOrAddress.id = dev.id;
      if(deviceIdOrAddress.id == null) return false;
    }

    let query = { device: deviceIdOrAddress.id };
    let found = this.topics.find(query);
    return found;
  }

  getAllSubscriptions() {
    let found = this.subscriptions.find();
    return found;
  }

  setSubscription(deviceIdOrAddress: any, topicIdOrName: any, qos: number) {
    if(typeof(qos) === 'undefined' || qos === null) qos = 0;

    if(deviceIdOrAddress.id === undefined) {
      if(deviceIdOrAddress.address === undefined) return false;
      let dev = this.getDeviceByAddr(deviceIdOrAddress.address);
      if(dev) deviceIdOrAddress.id = dev.id;
      if(deviceIdOrAddress.id == null) return false;
    }

    if(topicIdOrName.name === undefined) {
      if(topicIdOrName.id === undefined) return false;
      topicIdOrName.name = this.getTopic({ id: deviceIdOrAddress.id }, { id: topicIdOrName.id }).name;
    }

    let found = this.subscriptions.findOne({ '$and': [ {device: deviceIdOrAddress.id}, {topic: topicIdOrName.name} ] });

    if(!found) {
      found = {
        device: deviceIdOrAddress.id,
        topic: topicIdOrName.name,
        qos: qos
      }
      this.subscriptions.insert(found);
    }
    else {
      found.device = deviceIdOrAddress.id;
      found.topic = topicIdOrName.name;
      found.qos = qos;
      this.subscriptions.update(found);
    }

    return found;
  }

  getSubscriptionsFromTopic(topicName: string) {
    let found = this.subscriptions.find({ topic: topicName });
    return found;
  }

  getSubscriptionsFromDevice(deviceIdOrAddress: any) {
    if(deviceIdOrAddress.id === undefined) {
      if(deviceIdOrAddress.address === undefined) return false;
      let dev = this.getDeviceByAddr(deviceIdOrAddress.address);
      if(dev) deviceIdOrAddress.id = dev.id;
      if(deviceIdOrAddress.id == null) return false;
    }

    let found = this.subscriptions.find({ device: deviceIdOrAddress.id });
    return found;
  }

  removeSubscriptionsFromDevice(deviceIdOrAddress: any) {
    if(deviceIdOrAddress.id === undefined) {
      if(deviceIdOrAddress.address === undefined) return false;
      let dev = this.getDeviceByAddr(deviceIdOrAddress.address);
      if(dev) deviceIdOrAddress.id = dev.id;
      if(deviceIdOrAddress.id == null) return false;
    }
    this.subscriptions.removeWhere({ device: deviceIdOrAddress.id });
  }

  removeSubscription(deviceIdOrAddress: any, topicName: string, topicType: string) {
    if(deviceIdOrAddress.id === undefined) {
      if(deviceIdOrAddress.address === undefined) return false;
      let dev = this.getDeviceByAddr(deviceIdOrAddress.address);
      if(dev) deviceIdOrAddress.id = dev.id;
      if(deviceIdOrAddress.id == null) return false;
    }

    this.subscriptions.removeWhere({ '$and': [  { device: deviceIdOrAddress.id }, 
                                                { topic: topicName } ] });
    return true;
  }

  pushMessage(message: any) {
    this.messages.insert(message);
  }

  popMessagesFromDevice(deviceId: number) {
    if(typeof(deviceId) === 'undefined' || deviceId === null) return false;
    let messages = this.messages.find({ device: deviceId });
    this.messages.removeWhere({ device: deviceId });
    return messages;
  }

}
