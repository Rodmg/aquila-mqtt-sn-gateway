
import { EventEmitter } from 'events';
import * as mqttsn from 'mqttsn-packet';
import * as mqtt from 'mqtt';
import { log } from './Logger';
import { Forwarder, ForwarderMessage } from './Forwarder';
import { DBInterface } from './interfaces';
import { QoSSender, PublishMessage, MsgBufItem } from './QoSSender';

const parser = mqttsn.parser();

/*
  Manages mqtt-sn messages and protocol logic, forwards to mqtt

  Events:
    - deviceConnected
    - deviceDisconnected
 */

const TADV = 15*60;   // seconds
const NADV = 3;       // times
const TSEARCHGW = 5;  // seconds
const TGWINFO = 5;    // seconds
const TWAIT = 5*60;   // seconds
const TRETRY = 15;    // seconds
const NRETRY = 5;     // times

const GWID = 0x00FF;

const MAXLEN = 100; // Max message len allowed

// Interval for checking keep alive status
const KASERVINTERVAL = 1000;
// Keep Alive tolerance
const DURATION_TOLERANCE = 5000;
const DURATION_FACTOR = 1;

// Options for sending ping to device after marking as disconnected on timeout
const SEND_PINGREQ = true;
const PINGRES_TOUT = 1000;

// Non standard MQTT-SN features
// Allow automatic reconnect when receiving Disconnect with duration 
// (for entering sleep) even if device was disconnected
const ALLOW_SLEEP_RECONNECT = true;
// Allow automatic reconnect of lost devices when receiving a Ping request fron device
const ALLOW_LOST_RECONNECT_ON_PING = true;

export class Gateway extends EventEmitter {

  db: DBInterface;
  forwarder: Forwarder;
  client: mqtt.Client = null;
  externalClient: boolean = false;
  allowUnknownDevices: boolean = true;
  keepAliveInterval: NodeJS.Timer = null;
  advertiseInterval: NodeJS.Timer = null;

  qosSender: QoSSender;

  _onClientConnect: any;
  _onClientOffline: any;
  _onClientReconnect: any;
  _onClientMessage: any;
  _onParserError: any;

  constructor(db: DBInterface, forwarder: Forwarder, client?: mqtt.Client) {
    super();

    this.db = db;
    this.forwarder = forwarder;

    if(client != null) {
      this.externalClient = true;
      this.client = client;
    }

    this.qosSender = new QoSSender(this.forwarder);

    this._onClientConnect = () => this.onClientConnect();
    this._onClientOffline = () => this.onClientOffline();
    this._onClientReconnect = () => this.onClientReconnect();
    this._onClientMessage = (topic: string, message: Buffer, packet: any) => this.onClientMessage(topic, message, packet);

    this._onParserError = (error: any) => {
      log.error('mqtt-sn parser error:', error);
    }

  }

  destructor() {
    clearInterval(this.keepAliveInterval);
    clearInterval(this.advertiseInterval);

    this.client.removeListener('connect', this._onClientConnect);
    this.client.removeListener('offline', this._onClientOffline);
    this.client.removeListener('reconnect', this._onClientReconnect);
    this.client.removeListener('message', this._onClientMessage);

    parser.removeListener('error', this._onParserError);

    this.forwarder.disconnect();
    delete this.forwarder;
    delete this.db;
    if(this.externalClient) delete this.client;
    if(this.client == null || this.externalClient) return;
    this.client.end(false, () => {
      delete this.client;
    });
  }

  init(mqttUrl: string, allowUnknownDevices: boolean): Promise<void> {

    // Allow connection of not previously known devices, set to false when we only want to allow previously paired devices
    this.allowUnknownDevices = allowUnknownDevices;

    // data ({lqi, rssi, addr, mqttsnFrame})
    this.forwarder.on('data', (data: ForwarderMessage) => {
        let addr = data.addr;
        let packet = parser.parse(data.mqttsnFrame);

        if(packet == null) return log.debug("Bad mqttsn frame");

        log.debug('Got from forwarder:', packet);

        this.updateKeepAlive(addr, packet, data.lqi, data.rssi);

        if(packet.cmd === 'searchgw') this.attendSearchGW(addr, packet);
        if(packet.cmd === 'connect') this.attendConnect(addr, packet, data);
        if(packet.cmd === 'disconnect') this.attendDisconnect(addr, packet, data);
        if(packet.cmd === 'pingreq') this.attendPingReq(addr, packet, data);
        if(packet.cmd === 'pingresp') this.attendPingResp(addr, packet);
        if(packet.cmd === 'subscribe') this.attendSubscribe(addr, packet);
        if(packet.cmd === 'unsubscribe') this.attendUnsubscribe(addr, packet);
        if(packet.cmd === 'publish') this.attendPublish(addr, packet);
        if(packet.cmd === 'register') this.attendRegister(addr, packet);
        if(packet.cmd === 'willtopic') this.attendWillTopic(addr, packet);
        if(packet.cmd === 'willmsg') this.attendWillMsg(addr, packet);
        if(packet.cmd === 'willtopicupd') this.attendWillTopicUpd(addr, packet);
        if(packet.cmd === 'willmsgupd') this.attendWillMsgUpd(addr, packet);
        if(packet.cmd === 'puback') this.qosSender.attendPuback(addr, packet);
        if(packet.cmd === 'pubrel') this.emit(addr + '/pubrel/' + packet.msgId);  // QOS2 from device to broker support
        if(packet.cmd === 'pubrec') this.qosSender.attendPubrec(addr, packet); //this.respondQoS2PubRec(addr, packet); // QOS2 from broker to device support (semi-dummy)
        if(packet.cmd === 'pubcomp') this.qosSender.attendPubcomp(addr, packet);

      });

    parser.on('error', this._onParserError);

    return this.forwarder.connect()
    .then(() => {
      log.debug('Connected to Bridge');
      return this.connectMqtt(mqttUrl);
    })
    .then(() => {
      this.advertise();
      this.advertiseInterval = setInterval(() => this.advertise(), TADV*1000);
      // Init keep alive service
      this.keepAliveInterval = setInterval(() => {
        this.keepAliveService();
      }, KASERVINTERVAL);
    });
    
  }

  // attend ADVERTISE
  advertise() {
    let frame = mqttsn.generate({ cmd: 'advertise', gwId: GWID, duration: TADV });
    this.forwarder.send(0xFFFF, frame);
    log.trace("Advertising...");
  }

  onClientConnect() {
    log.debug('Connected to MQTT broker');
    // Subscribe to all saved topics on connect or reconnect
    this.subscribeSavedTopics();
  }

  onClientOffline() {
    log.warn('MQTT broker offline');
  }

  onClientReconnect() {
    log.warn('Trying to reconnect with MQTT broker');
  }

  async onClientMessage(topic: string, message: Buffer, packet: any) {
    if(message.length > MAXLEN) return log.warn("message too long");

    let subs;
    try {
      if(this.db == null) return; //log.error("tried to access db after destroy", topic, message, packet);
      subs = await this.db.getSubscriptionsFromTopic(topic);
    }
    catch(err) {
      return log.error(err);
    }

    for(let i in subs) {
      try {
        let topic = await this.db.getTopic(subs[i].deviceId, { id: subs[i].topicId });
        if(!topic) continue;
        let device = await this.db.getDeviceById(subs[i].deviceId);
        if(!device) continue;
        if(!device.connected) continue; // Don't send if disconnected
        if(device.state === 'asleep') {
          log.trace("Got message for sleeping device, buffering");
          // buffer messages for sleeping device
          await this.db.pushMessage({
              deviceId: device.id,
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

        this.qosSender.send(device.address, {
          topicIdType: 'normal',
          qos: subs[i].qos,
          retain: packet.retain,
          topicId: topic.mqttId,
          payload: message
        }).then((res) => {
          log.trace("Publish send success:", res);
        }).catch(err => {
          log.error(err);
        });

      }
      catch(err) {
        log.error(err);
        continue;
      }
    }
  }

  async subscribeSavedTopics() {
    let subs;
    try {
      subs = await this.db.getAllSubscriptions();
    }
    catch(err) {
      return log.error(err);
    }
    for(let i = 0; i < subs.length; i++) {
      this.client.subscribe(subs[i].topic.name, { qos: subs[i].qos });
    }
  }

  connectMqtt(url: string): Promise<void> {

    if(this.client == null) this.client = mqtt.connect(url);

    this.client.on('connect', this._onClientConnect);

    this.client.on('offline', this._onClientOffline);

    this.client.on('reconnect', this._onClientReconnect);

    this.client.on('message', this._onClientMessage);

    if(this.externalClient || this.client.connected) {
      // Do connect event for the first time
      // Subscribe to all saved topics on connect or reconnect
      this.subscribeSavedTopics();
      return Promise.resolve(null);
    }
    else {
      return new Promise<void>((resolve, reject) => {
        this.client.once('connect', () => {
          resolve(null);
        });
      });
    }
  }

  async isDeviceConnected(addr: number): Promise<boolean> {
    try {
      let device = await this.db.getDeviceByAddr(addr);
      if(!device) return false;
      return device.connected;
    }
    catch(err) {
      log.error(err);
      return false;
    }
  }

  async updateKeepAlive(addr: number, packet: any, lqi: number, rssi: number) {
    try {
      let device = await this.db.getDeviceByAddr(addr);
      if(!device) {
        log.trace('Unknown device, addr:', addr);
        return;
      }
      // Update last seen only if connected, else it should issue a connect message
      if(device.connected) {
        device.lastSeen = new Date();
        device.lqi = lqi;
        device.rssi = rssi;
        await this.db.setDevice(device);
      }
    }
    catch(err) {
      log.error(err);
    }
  }

  async keepAliveService() {
    let devices;
    try {
      devices = await this.db.getAllDevices();
    }
    catch(err) {
      log.error(err);
      return;
    }

    for(let i in devices)
    {
      if(devices[i].connected)
      {
        let now = (new Date()).getTime();
        // comparing time in ms
        if(now - devices[i].lastSeen > (devices[i].duration*1000*DURATION_FACTOR + DURATION_TOLERANCE ) )
        {
          if(SEND_PINGREQ)  // If we want to try to send pingreq to the device as a last try before marking as unconnected
          {
            if(!devices[i].waitingPingres)
            {
              log.trace("Sending pingreq to", devices[i].address);
              devices[i].waitingPingres = true;
              try {
                await this.db.setDevice(devices[i]);
              }
              catch(err) {
                log.error(err);
                continue;
              }
              let frame = mqttsn.generate({ cmd: 'pingreq' });
              this.forwarder.send(devices[i].address, frame);
            }
            else if(devices[i].lastSeen > (devices[i].duration*1000*DURATION_FACTOR + DURATION_TOLERANCE ) + PINGRES_TOUT)
            {
              devices[i].connected = false;
              devices[i].waitingPingres = false;
              devices[i].state = 'lost';
              try {
                await this.db.setDevice(devices[i]);
              }
              catch(err) {
                log.error(err);
                continue;
              }
              this.publishLastWill(devices[i]);
              this.emit("deviceDisconnected", devices[i]);
              log.debug("Device disconnected, address:", devices[i].address);
            }
            
          }
          else
          {
            devices[i].connected = false;
            devices[i].state = 'lost';
            try {
              await this.db.setDevice(devices[i]);
            }
            catch(err) {
              log.error(err);
              continue;
            }
            this.publishLastWill(devices[i]);
            this.emit("deviceDisconnected", devices[i]);
            log.debug("Device disconnected, address:", devices[i].address);
          }
        }
      }
    }
  }

  publishLastWill(device: any) {
    if(!device.willTopic) return;
    this.client.publish(device.willTopic, device.willMessage, { 
        qos: device.willQoS, 
        retain: device.willRetain 
      });
  }

  attendSearchGW(addr: number, packet: any) {
    log.trace('searchgw duration:', packet.duration);
    let frame = mqttsn.generate({ cmd: 'gwinfo', gwId: GWID });
    this.forwarder.send(addr, frame);
  }

  async attendConnect(addr: number, packet: any, data: ForwarderMessage) {
    // Check if device is already known
    let device;
    try {
      device = await this.db.getDeviceByAddr(addr);
    }
    catch(err) {
      log.error(err);
      return;
    }

    if(!device)
    {
      if(!this.allowUnknownDevices)
      {
        // Send connack false
        let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Rejected: not supported' });
        this.forwarder.send(addr, frame);
        return;
      }

      // Create new device object
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
        willRetain: null,
        clientId: null
      };
      if(packet.clientId != null) device.clientId = packet.clientId;
    }
    else
    {
      // Update device data
      device.connected = true;
      device.state = 'active';
      device.lqi = data.lqi;
      device.rssi = data.rssi;
      device.duration = packet.duration;
      device.lastSeen = new Date();
      if(packet.clientId != null) device.clientId = packet.clientId;
      else device.clientId = null;
    }

    if(packet.cleanSession)
    {
      // Delete will data according to spec
      device.willTopic = null;
      device.willMessage = null;
      device.willQoS = null;
      device.willRetain = null;
      // Remove all subscriptions from this client
      try {
        if(device.id != null) await this.db.removeSubscriptionsFromDevice(device.id);
      }
      catch(err) {
        log.error(err);
      }
    }
    
    try {
      await this.db.setDevice(device);
    }
    catch(err) {
      log.error(err);
      return;
    }

    if(packet.will) return this.requestWillTopic(addr); // If has will, first request will topic and msg

    let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
    this.forwarder.send(addr, frame);

    this.emit("deviceConnected", device);
  }

  async attendDisconnect(addr: number, packet: any, data: ForwarderMessage) {
    let duration = packet.duration;

    let device;
    try {
      device = await this.db.getDeviceByAddr(addr);
    }
    catch(err) {
      log.error(err);
      return;
    }
    if(!device) return;

    log.trace("Got Disconnect, duration:", duration);

    // If we got a disconnect with duration (for entering sleep), and our 
    // Device was not connected, mark as connected and announce connection
    let wasDisconnected = false;
    if(duration)
    {
      if(!ALLOW_SLEEP_RECONNECT && !device.connected) return;
      // Go to sleep
      device.duration = duration;
      // Always mark as connected and update keep alive parameters
      if(!device.connected) wasDisconnected = true;
      device.connected = true;
      device.lastSeen = new Date();
      device.lqi = data.lqi;
      device.rssi = data.rssi;
      device.state = 'asleep';
    }
    else
    {
      // Disconnect
      device.connected = false;
      device.state = 'disconnected';
    }
    
    try {
      await this.db.setDevice(device);
    }
    catch(err) {
      log.error(err);
      return;
    }

    let frame = mqttsn.generate({ cmd: 'disconnect' });
    this.forwarder.send(addr, frame);

    if(!duration) this.emit("deviceDisconnected", device);
    if(!(duration == null) && wasDisconnected) this.emit("deviceConnected", device);
  }

  async attendPingReq(addr: number, packet: any, data: ForwarderMessage) {
    // if(typeof(packet.clientId) !== 'undefined' && packet.clientId !== null)
    // {
      let device;
      try {
        device = await this.db.getDeviceByAddr(addr);
      }
      catch(err) {
        log.error(err);
        return;
      }
      if(!device) return;
      if(device.connected && device.state === 'asleep')
      {
        log.trace("Got Ping from sleeping device");
        // Goto Awake state
        device.state = 'awake';
        // Send any pending requests to device
        let messages;
        try {
          messages = await this.db.popMessagesFromDevice(device.id);
        }
        catch(err) {
          log.error(err);
          return;
        }
        log.trace("Buffered messages for sleeping device:", messages);
        for(let i in messages)
        {
          // TODO check if works with a lot of msgs
          try
          {
            if(messages[i].message.data != null)
            {
              // Trap for young players: Sometimes when loading buffered messages from DB, 
              // the message is not a Buffer, but an object with the buffer in data.
              // Happens when buffered messages where saved to disk, not attended and reloaded
              // on gateway restart.
              messages[i].message = new Buffer(messages[i].message.data);
            }

            this.qosSender.send(device.address, {
              topicIdType: messages[i].topicIdType,
              qos: messages[i].qos,
              retain: messages[i].retain,
              topicId: messages[i].topic.mqttId,
              payload: messages[i].message
            }).then((res) => {
              log.trace("Publish send success:", res);
            }).catch(err => {
              log.error(err);
            });

          }
          catch(err)
          {
            log.error(err);
          }
          
        }
        // Send pingresp for going back to sleep
        device.state = 'asleep';
      }
      else if(!device.connected && device.state === 'lost' && ALLOW_LOST_RECONNECT_ON_PING)
      {
        log.trace('Reconnecting lost device via Ping');
        // Update device data
        device.connected = true;
        device.state = 'active'; // TODO Test if no problem with sleeping devices...
        device.lqi = data.lqi;
        device.rssi = data.rssi;
        device.lastSeen = new Date();
        try {
          await this.db.setDevice(device);
        }
        catch(err) {
          log.error(err);
          return;
        }
        this.emit("deviceConnected", device);
      }
      else if(!device.connected) return;
    // }

    let frame = mqttsn.generate({ cmd: 'pingresp' });
    this.forwarder.send(addr, frame);
  }

  async attendPingResp(addr: number, packet: any) {
    log.trace("Got Ping response from", addr);

    // Update waitingPingres flag of device
    try {
      let device = await this.db.getDeviceByAddr(addr);
      if(!device) return;
      device.waitingPingres = false;
      await this.db.setDevice(device);
    }
    catch(err) {
      log.error(err);
      return;
    }
  }

  async attendSubscribe(addr: number, packet: any) {
    let qos = packet.qos;
    let topicIdType = packet.topicIdType; // TODO do different if type is != 'normal'
    let msgId = packet.msgId;
    let topicName: string;

    try {
      // Validate device connection
      let device = await this.db.getDeviceByAddr(addr);
      if(!device.connected) return;
      if(topicIdType == null) return log.warn("Invalid topicIdType on subscribe");

      if(topicIdType === 'pre-defined') topicName = packet.topicId;
      else topicName = packet.topicName;

      if(topicName == null) return log.warn("Invalid topicName on subscribe");

      let subscription = await this.db.setSubscription(device.id, topicName, qos); // TODO consideer adding type to subscription for using topicIdType
      // get topic details
      let topicInfo = await this.db.getTopic(device.id, { name: topicName });
      if(!topicInfo) return;

      let frame = mqttsn.generate({ cmd: 'suback', qos: qos, topicId: topicInfo.mqttId, msgId: msgId, returnCode: 'Accepted' });
      this.forwarder.send(addr, frame);

      // Give time for device to settle, Workaround for retained messages
      setTimeout(() => {
        this.client.subscribe(topicName, { qos: qos });
      }, 500);
    }
    catch(err) {
      log.error(err);
    }
    
  }

  async attendUnsubscribe(addr: number, packet: any) {
    let topicIdType = packet.topicIdType;
    let msgId = packet.msgId;
    let topicName;

    // Validate device connection
    if(! await this.isDeviceConnected(addr)) return;

    if(topicIdType === 'pre-defined') topicName = packet.topicId;
    else topicName = packet.topicName;

    try {
      let device = await this.db.getDeviceByAddr(addr);
      await this.db.removeSubscription(device.id, topicName, topicIdType);
      let frame = mqttsn.generate({ cmd: 'unsuback', msgId: msgId });
      this.forwarder.send(addr, frame);
    }
    catch(err) {
      log.error(err);
    }
  }

  async attendPublish(addr: number, packet: any) {
    let qos = packet.qos;
    let retain = packet.retain;
    let topicIdType = packet.topicIdType; // TODO do different if type is != 'normal'
    let mqttTopicId = packet.topicId;
    let msgId = packet.msgId;
    let payload = packet.payload;

    let device;
    try {
      device = await this.db.getDeviceByAddr(addr);
      if(!device) return;
    }
    catch(err) {
      log.error(err);
      return;
    }
    // Validate device connection
    if(!device.connected) return;

    let topicInfo;
    try {
      topicInfo = await this.db.getTopic(device.id, { mqttId: mqttTopicId });
    }
    catch(err) {
      log.error(err);
      return;
    }
    if(!topicInfo)
    {
      // Send PUBACK
      let frame = mqttsn.generate({ cmd: 'puback', topicId: mqttTopicId, msgId: msgId, returnCode: 'Rejected: invalid topic ID' });
      this.forwarder.send(addr, frame);
      return log.warn("Attend publish: Unknown topic id");
    }

    // NOTE: dup currently not supported by mqtt library... it will be ignored
    this.client.publish(topicInfo.name, payload, { qos: qos, retain: retain/*, dup: packet.dup*/ }, (err: any) => {
        if(err) {
          log.error("Publish error:", err);
          let frame = mqttsn.generate({ cmd: 'puback', topicId: mqttTopicId, msgId: msgId, returnCode: 'Rejected: congestion' });
          this.forwarder.send(addr, frame);
          return;
        }

        if(qos === 1) {
          // Send PUBACK
          let frame = mqttsn.generate({ cmd: 'puback', topicId: mqttTopicId, msgId: msgId, returnCode: 'Accepted' });
          this.forwarder.send(addr, frame);
        }
        else if(qos === 2) {
          // Send PUBREC
          let frame = mqttsn.generate({ cmd: 'pubrec', msgId: msgId });
          this.forwarder.send(addr, frame);
          // Wait for PUBREL
          var self = this;
          function onPubRel() {
            // Send PUBCOMP
            let frame = mqttsn.generate({ cmd: 'pubcomp', msgId: msgId });
            self.forwarder.send(addr, frame);
          }
          this.once(addr + '/pubrel/' + msgId, onPubRel);
          // cleanup subscription on timeout
          setTimeout(() => {
            this.removeListener(addr + '/pubrel/' + msgId, onPubRel);
          }, TRETRY*1000);
        }
      });
  }

  /*respondQoS2PubRec(addr: number, packet: any) {
    let msgId = packet.msgId;
    // Send PUBREL
    let frame = mqttsn.generate({ cmd: 'pubrel', msgId: msgId });
    this.forwarder.send(addr, frame);
    // Should wait for PUBCOMP, but we just dont mind...
  }*/

  async attendRegister(addr: number, packet: any) {
    //let topicId = packet.topicId;
    let msgId = packet.msgId;
    let topicName = packet.topicName;

    let device;
    try {
      device = await this.db.getDeviceByAddr(addr);
      if(!device) return;
    }
    catch(err) {
      log.error(err);
      return;
    }
    // Validate device connection
    if(!device.connected) return;

    // Check if topic already registered
    try {
      let topicInfo = await this.db.getTopic(device.id, { name: topicName });
      if(!topicInfo) topicInfo = await this.db.setTopic(device.id, topicName, null);  // generate new topic

      // regack with found topic id
      let frame = mqttsn.generate({ cmd: 'regack', topicId: topicInfo.mqttId, returnCode: 'Accepted' });
      this.forwarder.send(addr, frame);
    }
    catch(err) {
      log.error(err);
    }
  }

  requestWillTopic(addr: number) {
    let frame = mqttsn.generate({ cmd: 'willtopicreq' });
    this.forwarder.send(addr, frame);
  }

  async attendWillTopic(addr: number, packet: any) {
    let device;
    try {
      device = await this.db.getDeviceByAddr(addr);
    }
    catch(err) {
      log.error(err);
      return;
    }
    if(!device) return log.warn("Unknown device trying to register will topic");

    device.willQoS = packet.qos;
    device.willRetain = packet.retain;
    device.willTopic = packet.willTopic;

    try {
      await this.db.setDevice(device);
    }
    catch(err) {
      log.error(err);
      return;
    }

    this.requestWillMsg(addr);
  }

  requestWillMsg(addr: number) {
    let frame = mqttsn.generate({ cmd: 'willmsgreq' });
    this.forwarder.send(addr, frame);
  }

  async attendWillMsg(addr: number, packet: any) {
    try {
      let device = await this.db.getDeviceByAddr(addr);
      if(!device) return log.warn("Unknown device trying to register will msg");

      device.willMessage = packet.willMsg;

      await this.db.setDevice(device);

      // Send connack
      let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
      this.forwarder.send(addr, frame);

      this.emit("deviceConnected", device);
    }
    catch(err) {
      log.error(err);
      return;
    }
  }

  async attendWillTopicUpd(addr: number, packet: any) {
    try {
      let device = await this.db.getDeviceByAddr(addr);
      if(!device) return log.warn("Unknown device trying to update will topic");
      // Validate device connection
      if(!device.connected) return;

      if(!packet.willTopic) // Remove will topic and will message
      {
        device.willQoS = null;
        device.willRetain = null;
        device.willTopic = null;
        device.willMessage = null;
      }
      else
      {
        device.willQoS = packet.qos;
        device.willRetain = packet.retain;
        device.willTopic = packet.willTopic;
      }

      await this.db.setDevice(device);

      let frame = mqttsn.generate({ cmd: 'willtopicresp', returnCode: 'Accepted' });
      this.forwarder.send(addr, frame);
    }
    catch(err) {
      log.error(err);
    }
  }

  async attendWillMsgUpd(addr: number, packet: any) {
    try {
      let device = await this.db.getDeviceByAddr(addr);
      if(!device) return log.warn("Unknown device trying to update will msg");
      // Validate device connection
      if(!device.connected) return;

      device.willMessage = packet.willMsg;

      await this.db.setDevice(device);

      let frame = mqttsn.generate({ cmd: 'willmsgresp', returnCode: 'Accepted' });
      this.forwarder.send(addr, frame);
    }
    catch(err) {
      log.error(err);
    }
  }

}
