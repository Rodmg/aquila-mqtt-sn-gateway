'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var mqttsn = require('./lib/mqttsn-packet');
var parser = mqttsn.parser();
var mqtt = require('mqtt');
var GatewayDB = require('./GatewayDB');
var log = require('./Logger');

/*
  Manages mqtt-sn messages an protocol logic, forwards to mqtt

  Events:
    - ready
 */

var TADV = 15*60;   // seconds
var NADV = 3;       // times
var TSEARCHGW = 5;  // seconds
var TGWINFO = 5;    // seconds
var TWAIT = 5*60;   // seconds
var TRETRY = 15;    // seconds
var NRETRY = 5;     // times

var GWID = 0x00FF;

var MAXLEN = 100; // Max message len allowed

// Interval for checking keep alive status
var KASERVINTERVAL = 1000;
// Keep Alive tolerance
var DURATION_TOLERANCE = 5000;
var DURATION_FACTOR = 1;

var Gateway = function(forwarder)
{
  var self = this;
  self.forwarder = forwarder;
  self.client = null;
  self.db = new GatewayDB();
};

inherits(Gateway, EE);

Gateway.prototype.init = function(mqttUrl, callback)
{
  if(!callback) callback = function(){};
  var self = this;

  self.forwarder.connect();

  self.forwarder.on('ready', function onFwReady()
  {
    self.connectMqtt(mqttUrl, function onMqttReady()
      {
        callback();
        self.emit('ready');
      });

    advertise();
    setInterval(advertise, TADV*1000);
  });

  // data ({lqi, rssi, addr, mqttsnFrame})
  self.forwarder.on('data', function onFwData(data)
    {
      var addr = data.addr;
      var packet = parser.parse(data.mqttsnFrame);

      log.debug('Got from forwarder:', packet);

      self.updateKeepAlive(addr, packet, data.lqi, data.rssi);
      
      if(packet.cmd === 'searchgw') self.attendSearchGW(addr, packet);
      if(packet.cmd === 'connect') self.attendConnect(addr, packet, data);
      if(packet.cmd === 'disconnect') self.attendDisconnect(addr, packet);
      if(packet.cmd === 'pingreq') self.attendPingReq(addr, packet);
      if(packet.cmd === 'pingresp') self.attendPingResp(addr, packet);
      if(packet.cmd === 'subscribe') self.attendSubscribe(addr, packet);
      if(packet.cmd === 'unsubscribe') self.attendUnsubscribe(addr, packet);
      if(packet.cmd === 'publish') self.attendPublish(addr, packet);
      if(packet.cmd === 'register') self.attendRegister(addr, packet);
      if(packet.cmd === 'willtopic') self.attendWillTopic(addr, packet);
      if(packet.cmd === 'willmsg') self.attendWillMsg(addr, packet);
      if(packet.cmd === 'willtopicupd') self.attendWillTopicUpd(addr, packet);
      if(packet.cmd === 'willmsgupd') self.attendWillMsgUpd(addr, packet);
      if(packet.cmd === 'pubrel') self.emit(addr + '/pubrel/' + packet.msgId);  // QOS2 from device to broker support
      if(packet.cmd === 'pubrec') self.respondQoS2PubRec(addr, packet); // QOS2 from broker to device support (semi-dummy)

    });

  parser.on('error', function onParserError(error)
    {
      log.error('mqtt-sn parser error:', error);
    });

  // attend ADVERTISE
  function advertise()
  {
    var frame = mqttsn.generate({ cmd: 'advertise', gwId: GWID, duration: TADV });
    self.forwarder.send(0xFFFF, frame);
    log.trace("Advertising...");
  }

  setInterval(function kaServiceCaller()
  {
    self.keepAliveService();
  }, KASERVINTERVAL);

};

Gateway.prototype.connectMqtt = function(url, callback)
{
  if(!callback) callback = function(){};
  var self = this;

  self.client = mqtt.connect(url);

  self.client.on('connect', function onMqttConnect()
  {
    callback();
  });

  self.client.on('message', function onMqttMessage(topic, message, packet)
  {
    if(message.length > MAXLEN) return log.warn("message too long");
    var subs = self.db.getSubscriptionsFromTopic(topic);

    for(var i in subs)
    {
      var topic = self.db.getTopic({ id: subs[i].device }, { name: subs[i].topic });
      if(!topic) continue;
      var device = self.db.getDeviceById(subs[i].device);
      if(!device) continue;
      if(!device.connected) continue; // Don't send if disconnected
      if(device.state === 'asleep')
      {
        log.trace("Got message for sleeping device, buffering");
        // buffer messages for sleeping device
        self.db.pushMessage(
          {
            device: device.id,
            message: message,
            dup: packet.dup,
            retain: packet.retain,
            qos: subs[i].qos,
            topicId: topic.id,
            msgId: packet.msgId,
            topicIdType: 'normal'
          });
        continue;
      }
      // TODO implement QoS retry handling
      var frame = mqttsn.generate({ cmd: 'publish', 
                        topicIdType: 'normal', 
                        dup: packet.dup, 
                        qos: subs[i].qos, 
                        retain: packet.retain, 
                        topicId: topic.id, 
                        msgId: packet.messageId,
                        payload: message.toString('utf8') });

      self.forwarder.send(device.address, frame);
    }

  });
};

Gateway.prototype.updateKeepAlive = function(addr, packet, lqi, rssi)
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
  if(!device)
  {
    log.trace('Unknown device, addr:', addr);
    return;
  }
  // Update last seen only if connected, else it should issue a connect message
  if(device.connected)
  {
    device.lastSeen = new Date();
    device.lqi = lqi;
    device.rssi = rssi;
    self.db.setDevice(device);
  }
};

Gateway.prototype.keepAliveService = function()
{
  var self = this;
  var devices = self.db.getAllDevices();
  for(var i in devices)
  {
    if(devices[i].connected)
    {
      var now = new Date();
      // comparing time in ms
      if(now - devices[i].lastSeen > (devices[i].duration*1000*DURATION_FACTOR + DURATION_TOLERANCE ) )
      {
        devices[i].connected = false;
        devices[i].state = 'lost';
        self.db.setDevice(devices[i]);
        self.publishLastWill(devices[i]);
        log.debug("Device disconnected, address:", devices[i].address);
      }
    }
  }
};

Gateway.prototype.publishLastWill = function(device)
{
  var self = this;
  if(!device.willTopic) return;
  self.client.publish(device.willTopic, device.willMessage, 
    { 
      qos: device.willQoS, 
      retain: device.willRetain 
    });
};

Gateway.prototype.attendSearchGW = function(addr, packet)
{
  var self = this;
  log.trace('searchgw duration:', packet.duration);

  var frame = mqttsn.generate({ cmd: 'gwinfo', gwId: GWID });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendConnect = function(addr, packet, data)
{
  var self = this;

  // Check if device is already known
  var device = self.db.getDeviceByAddr(addr);

  if(!device)
  {
    // Create new device object
    var device = {
      address: addr,
      connected: true,
      state: 'active',
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
    self.db.removeSubscriptionsFromDevice({ address: addr }); 
  }
  
  self.db.setDevice(device);

  if(packet.will) return self.requestWillTopic(addr); // If has will, first request will topic and msg

  var frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendDisconnect = function(addr, packet)
{
  var self = this;
  var duration = packet.duration;

  var device = self.db.getDeviceByAddr(addr);
  if(!device) return;

  log.trace("Got Disconnect, duration:", duration);

  if(duration)
  {
    // Go to sleep
    device.duration = duration;
    device.state = 'asleep';
  }
  else
  {
    // Disconnect
    device.connected = false;
    device.state = 'disconnected';
  }
  
  self.db.setDevice(device);

  var frame = mqttsn.generate({ cmd: 'disconnect' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendPingReq = function(addr, packet)
{
  var self = this;
  // if(typeof(packet.clientId) !== 'undefined' && packet.clientId !== null)
  // {
    var device = self.db.getDeviceByAddr(addr);
    if(!device || !device.connected) return;
    if(device.connected && device.state === 'asleep')
    {
      log.trace("Got Ping from sleeping device");
      // Goto Awake state
      device.state = 'awake';
      // Send any pending requests to device
      var messages = self.db.popMessagesFromDevice(device.id);
      log.trace("Buffered messages for sleeping device:", messages);
      for(var i in messages)
      {
        // TODO check if works with a lot of msgs
        var frame = mqttsn.generate({ cmd: 'publish', 
                          topicIdType: messages[i].topicIdType, 
                          dup: messages[i].dup, 
                          qos: messages[i].qos, 
                          retain: messages[i].retain, 
                          topicId: messages[i].topicId, 
                          msgId: messages[i].msgId,
                          payload: messages[i].message.toString('utf8') });

        self.forwarder.send(device.address, frame);
      }
      // Send pingresp for going back to sleep
      device.state = 'asleep';
    }
  // }

  var frame = mqttsn.generate({ cmd: 'pingresp' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendPingResp = function(addr, packet)
{
  log.trace("Got Ping response from", addr);
};

Gateway.prototype.attendSubscribe = function(addr, packet)  // TODO validate device connection
{
  var self = this;
  var qos = packet.qos;
  var topicIdType = packet.topicIdType; // TODO do different if type is != 'normal'
  var msgId = packet.msgId;
  var topicName;

  if(topicIdType === 'pre-defined') topicName = packet.topicId;
  else topicName = packet.topicName;

  var subscription = self.db.setSubscription({ address: addr }, { name: topicName }, qos);
  // Check if topic is registered
  var topicInfo = self.db.getTopic({ address: addr }, { name: topicName });
  if(!topicInfo) topicInfo = self.db.setTopic({ address: addr }, topicName, null);  // generate new topic

  var frame = mqttsn.generate({ cmd: 'suback', qos: qos, topicId: topicInfo.id, msgId: msgId, returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);

  // Give time for device to settle, Workaround for retained messages
  setTimeout(function()
  {
    self.client.subscribe(topicName, { qos: qos });
  }, 500);
};

Gateway.prototype.attendUnsubscribe = function(addr, packet) // TODO validate device connection
{
  var self = this;
  var topicIdType = packet.topicIdType;
  var msgId = packet.msgId;
  var topicName;

  if(topicIdType === 'pre-defined') topicName = packet.topicId;
  else topicName = packet.topicName;

  self.db.removeSubscription({ address: addr }, topicName, topicIdType);
  var frame = mqttsn.generate({ cmd: 'unsuback', msgId: msgId });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendPublish = function(addr, packet) // TODO validate device connection
{
  var self = this;
  var qos = packet.qos;
  var retain = packet.retain;
  var topicIdType = packet.topicIdType; // TODO do different if type is != 'normal'
  var topicId = packet.topicId;
  var msgId = packet.msgId;
  var payload = packet.payload;

  var topicInfo = self.db.getTopic({ address: addr }, { id: topicId });
  if(!topicInfo)
  {
    // Send PUBACK
    var frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Rejected: invalid topic ID' });
    self.forwarder.send(addr, frame);
    return log.warn("Attend publish: Unknown topic id");
  }

  // NOTE: dup currently not supported by mqtt library... it will be ignored
  self.client.publish(topicInfo.name, payload, { qos: qos, retain: retain, dup: packet.dup }, function onPublishEnd(err)
    {
      if(err)
      {
        log.error("Publish error:", err);
        var frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Rejected: congestion' });
        self.forwarder.send(addr, frame);
        return;
      }

      if(qos === 1)
      {
        // Send PUBACK
        var frame = mqttsn.generate({ cmd: 'puback', topicId: topicId, msgId: msgId, returnCode: 'Accepted' });
        self.forwarder.send(addr, frame);
      }
      else if(qos === 2)
      {
        // Send PUBREC
        var frame = mqttsn.generate({ cmd: 'pubrec', msgId: msgId });
        self.forwarder.send(addr, frame);
        // Wait for PUBREL
        function onPubRel()
        {
          // Send PUBCOMP
          var frame = mqttsn.generate({ cmd: 'pubcomp', msgId: msgId });
          self.forwarder.send(addr, frame);
        }
        self.once(addr + '/pubrel/' + msgId, onPubRel);
        // cleanup subscription on timeout
        setTimeout(function onPubrelTimeout()
          {
            self.removeListener(addr + '/pubrel/' + msgId, onPubRel);
          }, TRETRY*1000);
      }
    });
};

Gateway.prototype.respondQoS2PubRec = function(addr, packet)
{
  var self = this;
  var msgId = packet.msgId;
  // Send PUBREL
  var frame = mqttsn.generate({ cmd: 'pubrel', msgId: msgId });
  self.forwarder.send(addr, frame);
  // Should wait for PUBCOMP, but we just dont mind...
};

Gateway.prototype.attendRegister = function(addr, packet) // TODO validate device connection
{
  var self = this;
  //var topicId = packet.topicId;
  var msgId = packet.msgId;
  var topicName = packet.topicName;

  // Check if topic already registered
  var topicInfo = self.db.getTopic({ address: addr }, { name: topicName });
  if(!topicInfo) topicInfo = self.db.setTopic({ address: addr }, topicName, null);  // generate new topic

  // regack with found topic id
  var frame = mqttsn.generate({ cmd: 'regack', topicId: topicInfo.id, returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.requestWillTopic = function(addr)
{
  var self = this;
  var frame = mqttsn.generate({ cmd: 'willtopicreq' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendWillTopic = function(addr, packet)
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
  if(!device) return log.warn("Unknown device trying to register will topic");

  device.willQoS = packet.qos;
  device.willRetain = packet.retain;
  device.willTopic = packet.willTopic;

  self.db.setDevice(device);

  self.requestWillMsg(addr);
};

Gateway.prototype.requestWillMsg = function(addr)
{
  var self = this;
  var frame = mqttsn.generate({ cmd: 'willmsgreq' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendWillMsg = function(addr, packet)
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
  if(!device) return log.warn("Unknown device trying to register will msg");

  device.willMessage = packet.willMsg;

  self.db.setDevice(device);

  // Send connack
  var frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendWillTopicUpd = function(addr, packet) // TODO validate device connection
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
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

  self.db.setDevice(device);

  var frame = mqttsn.generate({ cmd: 'willtopicresp', returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendWillMsgUpd = function(addr, packet) // TODO validate device connection
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
  if(!device) return log.warn("Unknown device trying to update will msg");

  device.willMessage = packet.willMsg;

  self.db.setDevice(device);

  var frame = mqttsn.generate({ cmd: 'willmsgresp', returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

module.exports = Gateway;