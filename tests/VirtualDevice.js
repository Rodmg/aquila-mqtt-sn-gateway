'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var mqttsn = require('mqttsn-packet');
var parser = mqttsn.parser();
var log = require('./../Logger');

var DURATION = 60;

var VirtualDevice = function(addr, network)
{
  var self = this;
  self.addr = addr;
  self.connected = false;
  self.network = network;

  setInterval(function deviceKeepAlive()
    {
      if(!self.connected) return;

      var data = {
        addr: self.addr,
        frame: mqttsn.generate({ cmd: 'pingreq', clientId: 'test' })
      }
      self.network.emit('data', data);

    }, DURATION*1000);
};

inherits(VirtualDevice, EE);

VirtualDevice.prototype.sendFrame = function(frame)
{
  var self = this;
  var data = {
    addr: self.addr,
    frame: frame
  };
  self.network.emit('data', data);
};

VirtualDevice.prototype.parse = function(frame)
{
  var self = this;
  var packet = parser.parse(frame);
  log.debug("Device", self.addr, "got Packet:", packet);
  if(packet.cmd === 'willtopicreq') setTimeout(function(){self.emit('willtopicreq')}, 10);
  if(packet.cmd === 'willmsgreq') setTimeout(function(){self.emit('willmsgreq')}, 10);
  if(packet.cmd === 'suback') setTimeout(function(){self.emit('suback')}, 10);
  if(packet.cmd === 'unsuback') setTimeout(function(){self.emit('unsuback')}, 10);
  if(packet.cmd === 'regack') setTimeout(function(){self.emit('regack')}, 10);
  if(packet.cmd === 'disconnect') setTimeout(function(){self.emit('disconnect')}, 10);
  if(packet.cmd === 'connack') setTimeout(function(){self.connected = true; self.emit('connack')}, 10);
};

VirtualDevice.prototype.connect = function(withWill)
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'connect', will: withWill, cleanSession: true, duration: DURATION, clientId: 'test' }));
};

VirtualDevice.prototype.waitFor = function(msgType, callback)
{
  var self = this;
  self.once(msgType, callback);
};

VirtualDevice.prototype.willTopic = function()
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'willtopic', willTopic: 'will', qos: 0, retain: false }));
};

VirtualDevice.prototype.willMsg = function()
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'willmsg', willMsg: 'last will' }));
};

VirtualDevice.prototype.subscribe = function(qos, topicIdType, topicName)
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'subscribe', qos: qos, topicIdType: topicIdType, topicName: topicName }));
};

VirtualDevice.prototype.unsubscribe = function(topicIdType, topicName)
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'unsubscribe', topicIdType: topicIdType, topicName: topicName }));
};

VirtualDevice.prototype.publish = function(qos, retain, topicIdType, topicId, payload)
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'publish', qos: qos, retain: retain, topicIdType: topicIdType, topicId: topicId, payload: payload }));
};

VirtualDevice.prototype.register = function(topic)
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'register', topicName: topic }));
};

VirtualDevice.prototype.disconnect = function(duration)
{
  var self = this;
  self.sendFrame(mqttsn.generate({ cmd: 'disconnect', duration: duration }));
};

module.exports = VirtualDevice;

