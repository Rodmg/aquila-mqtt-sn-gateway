'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var Forwarder = require('./Forwarder');
var mqttsn = require('./lib/mqttsn-packet');
var parser = mqttsn.parser();
var mqtt = require('mqtt');
var GatewayDB = require('./GatewayDB');

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

var Gateway = function()
{
  var self = this;
  self.forwarder = new Forwarder();
  self.client = null;
  self.db = new GatewayDB();
};

inherits(Gateway, EE);

Gateway.prototype.init = function(mqttUrl, port, baudrate, callback)
{
  if(!callback) callback = function(){};
  var self = this;

  self.forwarder.connect(port, baudrate);

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

      console.log(packet);

      self.updateKeepAlive(addr, packet, data.lqi, data.rssi);
      
      if(packet.cmd === 'searchgw') self.attendSearchGW(addr, packet);
      if(packet.cmd === 'connect') self.attendConnect(addr, packet, data);
      if(packet.cmd === 'disconnect') self.attendDisconnect(addr, packet);
      if(packet.cmd === 'pingreq') self.attendPingReq(addr, packet);
      if(packet.cmd === 'subscribe') self.attendSubscribe(addr, packet);
      if(packet.cmd === 'unsubscribe') self.attendUnsubscribe(addr, packet);
      if(packet.cmd === 'publish') self.attendPublish(addr, packet);
      if(packet.cmd === 'register') self.attendRegister(addr, packet);
      if(packet.cmd === 'willtopic') self.attendWillTopic(addr, packet);
      if(packet.cmd === 'willmsg') self.attendWillMsg(addr, packet);
      if(packet.cmd === 'willtopicupd') self.attendWillTopicUpd(addr, packet);
      if(packet.cmd === 'willmsgupd') self.attendWillMsgUpd(addr, packet);

    });

  parser.on('error', function(error)
    {
      console.log('mqtt-sn parser error:', error);
    });

  // attend ADVERTISE
  function advertise()
  {
    var frame = mqttsn.generate({ cmd: 'advertise', gwId: GWID, duration: TADV });
    self.forwarder.send(0xFFFF, frame);
    console.log("Advertising...");
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

  self.client.on('message', function onMqttMessage(topic, message)
  {
    if(message.length > MAXLEN) return console.log("message too long");
    var subs = self.db.getSubscriptionsFromTopic(topic);

    for(var i in subs)
    {
      var topic = self.db.getTopic({ id: subs[i].device }, { name: subs[i].topic });
      if(!topic) continue;
      var device = self.db.getDeviceById(subs[i].device);
      if(!device) continue;
      if(!device.connected) continue; // Don't send if disconnected
      var frame = mqttsn.generate({ cmd: 'publish', 
                        topicIdType: 'normal', 
                        //dup: false, 
                        qos: subs[i].qos, 
                        //retain: false, 
                        topicId: topic.id, 
                        //msgId: 0, // TODO
                        payload: message.toString('utf8') });

      self.forwarder.send(device.address, frame);
    }

  });
};

// TODO: update keep alive also when sending a message to the device correctly???
Gateway.prototype.updateKeepAlive = function(addr, packet, lqi, rssi)
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
  if(!device) return;
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
      if(now - devices[i].lastSeen > devices[i].duration*1000)
      {
        devices[i].connected = false;
        devices[i].state = 'lost';
        self.db.setDevice(devices[i]);
        self.publishLastWill(devices[i]);
        //console.log("_________Device disconnected");
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
  console.log('searchgw duration:', packet.duration);

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

  console.log("Disconnect duration:", duration);

  if(duration)
  {
    // TODO sleep things
  }

  var device = self.db.getDeviceByAddr(addr);
  if(!device) return;
  device.connected = false;
  device.state = 'disconnected';
  self.db.setDevice(device);

  var frame = mqttsn.generate({ cmd: 'disconnect' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendPingReq = function(addr, packet)
{
  var self = this;
  var frame = mqttsn.generate({ cmd: 'pingresp' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendSubscribe = function(addr, packet)
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

  self.client.subscribe(topicName, { qos: qos });

  var frame = mqttsn.generate({ cmd: 'suback', qos: qos, topicId: topicInfo.id, msgId: msgId, returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendUnsubscribe = function(addr, packet)
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

Gateway.prototype.attendPublish = function(addr, packet)
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
    return console.log(">>>>>>>>>>Attend publish: Unknown topic id");
  }

  // NOTE: dup currently not supported by mqtt library... it will be ignored
  self.client.publish(topicInfo.name, payload, { qos: qos, retain: retain, dup: packet.dup }, function()
    {
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
        // TODO
        // Send PUBCOMP
        var frame = mqttsn.generate({ cmd: 'pubcomp', msgId: msgId });
        self.forwarder.send(addr, frame);
      }
    });
};

Gateway.prototype.attendRegister = function(addr, packet)
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
  if(!device) return console.log(">>>>Unknown device trying to register will topic");

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
  if(!device) return console.log(">>>>Unknown device trying to register will msg");

  device.willMessage = packet.willMsg;

  self.db.setDevice(device);

  // Send connack
  var frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

Gateway.prototype.attendWillTopicUpd = function(addr, packet)
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
  if(!device) return console.log(">>>>Unknown device trying to update will topic");

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

Gateway.prototype.attendWillMsgUpd = function(addr, packet)
{
  var self = this;
  var device = self.db.getDeviceByAddr(addr);
  if(!device) return console.log(">>>>Unknown device trying to update will msg");

  device.willMessage = packet.willMsg;

  self.db.setDevice(device);

  var frame = mqttsn.generate({ cmd: 'willmsgresp', returnCode: 'Accepted' });
  self.forwarder.send(addr, frame);
};

module.exports = Gateway;