'use strict';

const inherits  = require('util').inherits;
const EventEmitter = require('events').EventEmitter;
const mqttsn = require('mqttsn-packet');
const parser = mqttsn.parser();
const mqtt = require('mqtt');
const log = require('./Logger');

/*
  Manages mqtt-sn messages and protocol logic, forwards to mqtt

  Events:
    - ready
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

class Gateway extends EventEmitter {

  constructor(db, forwarder) {
    super();

    this.forwarder = forwarder;
    this.client = null;
    this.db = db;
  }

  init(mqttUrl, allowUnknownDevices, callback) {
    if(!callback) callback = function(){};

    // Allow connection of not previously known devices, set to false when we only want to allow previously paired devices
    this.allowUnknownDevices = allowUnknownDevices;

    this.forwarder.connect();

    this.forwarder.on('ready', () => {
      log.debug('Connected to Bridge');
      this.connectMqtt(mqttUrl, () => {
          this.advertise();
          setInterval(() => this.advertise(), TADV*1000);
          callback();
          this.emit('ready');
        });
    });

    // data ({lqi, rssi, addr, mqttsnFrame})
    this.forwarder.on('data', (data) => {
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
        if(packet.cmd === 'pubrel') this.emit(addr + '/pubrel/' + packet.msgId);  // QOS2 from device to broker support
        if(packet.cmd === 'pubrec') this.respondQoS2PubRec(addr, packet); // QOS2 from broker to device support (semi-dummy)

      });

    parser.on('error', (error) => {
        log.error('mqtt-sn parser error:', error);
      });

    // Init keep alive service
    setInterval(() => {
      this.keepAliveService();
    }, KASERVINTERVAL);
  }

  // attend ADVERTISE
  advertise() {
    let frame = mqttsn.generate({ cmd: 'advertise', gwId: GWID, duration: TADV });
    this.forwarder.send(0xFFFF, frame);
    log.trace("Advertising...");
  }

  subscribeSavedTopics() {
    let subs = this.db.getAllSubscriptions();
    for(let i = 0; i < subs.length; i++) {
      this.client.subscribe(subs[i].topic, { qos: subs[i].qos });
    }
  }

  connectMqtt(url, callback) {
    if(!callback) callback = function(){};

    this.client = mqtt.connect(url);

    this.client.on('connect', () => {
      log.debug('Connected to MQTT broker');
      // Subscribe to all saved topics on connect or reconnect
      this.subscribeSavedTopics();
      callback();
    });

    // this.client.on('close', () => {
    //     console.log(">>>>Close");
    //   });

    this.client.on('offline', () =>{
        log.warn('MQTT broker offline');
      });

    this.client.on('reconnect', () => {
        log.warn('Trying to reconnect with MQTT broker');
      });

    this.client.on('message', (topic, message, packet) => {
      if(message.length > MAXLEN) return log.warn("message too long");
      let subs = this.db.getSubscriptionsFromTopic(topic);

      for(let i in subs) {
        let topic = this.db.getTopic({ id: subs[i].device }, { name: subs[i].topic });
        if(!topic) continue;
        let device = this.db.getDeviceById(subs[i].device);
        if(!device) continue;
        if(!device.connected) continue; // Don't send if disconnected
        if(device.state === 'asleep') {
          log.trace("Got message for sleeping device, buffering");
          // buffer messages for sleeping device
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
        // TODO implement QoS retry handling
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
  }

  isDeviceConnected(addr) {
    let device = this.db.getDeviceByAddr(addr);
    if(!device) return false;
    return device.connected;
  }

  updateKeepAlive(addr, packet, lqi, rssi) {
    let device = this.db.getDeviceByAddr(addr);
    if(!device) {
      log.trace('Unknown device, addr:', addr);
      return;
    }
    // Update last seen only if connected, else it should issue a connect message
    if(device.connected) {
      device.lastSeen = new Date();
      device.lqi = lqi;
      device.rssi = rssi;
      this.db.setDevice(device);
    }
  }

  keepAliveService() {
    let devices = this.db.getAllDevices();
    for(let i in devices)
    {
      if(devices[i].connected)
      {
        let now = new Date();
        // comparing time in ms
        if(now - devices[i].lastSeen > (devices[i].duration*1000*DURATION_FACTOR + DURATION_TOLERANCE ) )
        {
          if(SEND_PINGREQ)  // If we want to try to send pingreq to the device as a last try before marking as unconnected
          {
            if(!devices[i].waitingPingres)
            {
              log.trace("Sending pingreq to", devices[i].address);
              devices[i].waitingPingres = true;
              this.db.setDevice(devices[i]);
              let frame = mqttsn.generate({ cmd: 'pingreq' });
              this.forwarder.send(devices[i].address, frame);
            }
            else if(devices[i].lastSeen > (devices[i].duration*1000*DURATION_FACTOR + DURATION_TOLERANCE ) + PINGRES_TOUT)
            {
              devices[i].connected = false;
              devices[i].waitingPingres = false;
              devices[i].state = 'lost';
              this.db.setDevice(devices[i]);
              this.publishLastWill(devices[i]);
              this.emit("deviceDisconnected", devices[i]);
              log.debug("Device disconnected, address:", devices[i].address);
            }
            
          }
          else
          {
            devices[i].connected = false;
            devices[i].state = 'lost';
            this.db.setDevice(devices[i]);
            this.publishLastWill(devices[i]);
            this.emit("deviceDisconnected", devices[i]);
            log.debug("Device disconnected, address:", devices[i].address);
          }
        }
      }
    }
  }

  publishLastWill(device) {
    if(!device.willTopic) return;
    this.client.publish(device.willTopic, device.willMessage, { 
        qos: device.willQoS, 
        retain: device.willRetain 
      });
  }

  attendSearchGW(addr, packet) {
    log.trace('searchgw duration:', packet.duration);
    let frame = mqttsn.generate({ cmd: 'gwinfo', gwId: GWID });
    this.forwarder.send(addr, frame);
  }

  attendConnect(addr, packet, data) {
    // Check if device is already known
    let device = this.db.getDeviceByAddr(addr);
    console.log(device);

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
        willRetain: null
      };
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
    }

    if(packet.cleanSession)
    {
      // Delete will data according to spec
      device.willTopic = null;
      device.willMessage = null;
      device.willQoS = null;
      device.willRetain = null;
      // Remove all subscriptions from this client
      this.db.removeSubscriptionsFromDevice({ address: addr }); 
    }
    
    this.db.setDevice(device);

    if(packet.will) return this.requestWillTopic(addr); // If has will, first request will topic and msg

    let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
    this.forwarder.send(addr, frame);

    this.emit("deviceConnected", device);
  }

  attendDisconnect(addr, packet, data) {
    let duration = packet.duration;

    let device = this.db.getDeviceByAddr(addr);
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
    
    this.db.setDevice(device);

    let frame = mqttsn.generate({ cmd: 'disconnect' });
    this.forwarder.send(addr, frame);

    if(!duration) this.emit("deviceDisconnected", device);
    if(!(duration == null) && wasDisconnected) this.emit("deviceConnected", device);
  }

  attendPingReq(addr, packet, data) {
    // if(typeof(packet.clientId) !== 'undefined' && packet.clientId !== null)
    // {
      let device = this.db.getDeviceByAddr(addr);
      if(!device) return;
      if(device.connected && device.state === 'asleep')
      {
        log.trace("Got Ping from sleeping device");
        // Goto Awake state
        device.state = 'awake';
        // Send any pending requests to device
        let messages = this.db.popMessagesFromDevice(device.id);
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
        this.db.setDevice(device);
        this.emit("deviceConnected", device);
      }
      else if(!device.connected) return;
    // }

    let frame = mqttsn.generate({ cmd: 'pingresp' });
    this.forwarder.send(addr, frame);
  }

  attendPingResp(addr, packet) {
    log.trace("Got Ping response from", addr);

    // Update waitingPingres flag of device
    let device = this.db.getDeviceByAddr(addr);
    if(!device) return;
    device.waitingPingres = false;
    this.db.setDevice(device);
  }

  attendSubscribe(addr, packet) {
    let qos = packet.qos;
    let topicIdType = packet.topicIdType; // TODO do different if type is != 'normal'
    let msgId = packet.msgId;
    let topicName;

    // Validate device connection
    if(!this.isDeviceConnected(addr)) return;
    if(topicIdType == null) return log.warn("Invalid topicIdType on subscribe");

    if(topicIdType === 'pre-defined') topicName = packet.topicId;
    else topicName = packet.topicName;

    if(topicName == null) return log.warn("Invalid topicName on subscribe");

    let subscription = this.db.setSubscription({ address: addr }, { name: topicName }, qos);
    // Check if topic is registered
    let topicInfo = this.db.getTopic({ address: addr }, { name: topicName });
    if(!topicInfo) topicInfo = this.db.setTopic({ address: addr }, topicName, null);  // generate new topic

    let frame = mqttsn.generate({ cmd: 'suback', qos: qos, topicId: topicInfo.id, msgId: msgId, returnCode: 'Accepted' });
    this.forwarder.send(addr, frame);

    // Give time for device to settle, Workaround for retained messages
    setTimeout(() => {
      this.client.subscribe(topicName, { qos: qos });
    }, 500);
  }

  attendUnsubscribe(addr, packet) {
    let topicIdType = packet.topicIdType;
    let msgId = packet.msgId;
    let topicName;

    // Validate device connection
    if(!this.isDeviceConnected(addr)) return;

    if(topicIdType === 'pre-defined') topicName = packet.topicId;
    else topicName = packet.topicName;

    this.db.removeSubscription({ address: addr }, topicName, topicIdType);
    let frame = mqttsn.generate({ cmd: 'unsuback', msgId: msgId });
    this.forwarder.send(addr, frame);
  }

  attendPublish(addr, packet) {
    let qos = packet.qos;
    let retain = packet.retain;
    let topicIdType = packet.topicIdType; // TODO do different if type is != 'normal'
    let topicId = packet.topicId;
    let msgId = packet.msgId;
    let payload = packet.payload;

    // Validate device connection
    if(!this.isDeviceConnected(addr)) return;

    let topicInfo = this.db.getTopic({ address: addr }, { id: topicId });
    if(!topicInfo)
    {
      // Send PUBACK
      let frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Rejected: invalid topic ID' });
      this.forwarder.send(addr, frame);
      return log.warn("Attend publish: Unknown topic id");
    }

    // NOTE: dup currently not supported by mqtt library... it will be ignored
    this.client.publish(topicInfo.name, payload, { qos: qos, retain: retain, dup: packet.dup }, (err) => {
        if(err) {
          log.error("Publish error:", err);
          let frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Rejected: congestion' });
          this.forwarder.send(addr, frame);
          return;
        }

        if(qos === 1) {
          // Send PUBACK
          let frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Accepted' });
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

  respondQoS2PubRec(addr, packet) {
    let msgId = packet.msgId;
    // Send PUBREL
    let frame = mqttsn.generate({ cmd: 'pubrel', msgId: msgId });
    this.forwarder.send(addr, frame);
    // Should wait for PUBCOMP, but we just dont mind...
  }

  attendRegister(addr, packet) {
    //let topicId = packet.topicId;
    let msgId = packet.msgId;
    let topicName = packet.topicName;

    // Validate device connection
    if(!this.isDeviceConnected(addr)) return;

    // Check if topic already registered
    let topicInfo = this.db.getTopic({ address: addr }, { name: topicName });
    if(!topicInfo) topicInfo = this.db.setTopic({ address: addr }, topicName, null);  // generate new topic

    // regack with found topic id
    let frame = mqttsn.generate({ cmd: 'regack', topicId: topicInfo.id, returnCode: 'Accepted' });
    this.forwarder.send(addr, frame);
  }

  requestWillTopic(addr) {
    let frame = mqttsn.generate({ cmd: 'willtopicreq' });
    this.forwarder.send(addr, frame);
  }

  attendWillTopic(addr, packet) {
    let device = this.db.getDeviceByAddr(addr);
    if(!device) return log.warn("Unknown device trying to register will topic");

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
    if(!device) return log.warn("Unknown device trying to register will msg");

    device.willMessage = packet.willMsg;

    this.db.setDevice(device);

    // Send connack
    let frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
    this.forwarder.send(addr, frame);

    this.emit("deviceConnected", device);
  }

  attendWillTopicUpd(addr, packet) {
    // Validate device connection
    if(!this.isDeviceConnected(addr)) return;

    let device = this.db.getDeviceByAddr(addr);
    if(!device) return log.warn("Unknown device trying to update will topic");

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

    this.db.setDevice(device);

    let frame = mqttsn.generate({ cmd: 'willtopicresp', returnCode: 'Accepted' });
    this.forwarder.send(addr, frame);
  }

  attendWillMsgUpd(addr, packet) {
    // Validate device connection
    if(!this.isDeviceConnected(addr)) return;

    let device = this.db.getDeviceByAddr(addr);
    if(!device) return log.warn("Unknown device trying to update will msg");

    device.willMessage = packet.willMsg;

    this.db.setDevice(device);

    let frame = mqttsn.generate({ cmd: 'willmsgresp', returnCode: 'Accepted' });
    this.forwarder.send(addr, frame);
  }

}

module.exports = Gateway;