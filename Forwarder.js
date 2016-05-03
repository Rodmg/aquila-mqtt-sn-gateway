'use strict';

var SerialTransport = require('./SerialTransport');
var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;

/*
  Manages connections with bridge and initial parsing

  Events:
    data ({lqi, rssi, addr, mqttsnFrame})
    ready

  TODO: add not connected state management
 */


var Forwarder = function()
{
  var self = this;
  self.transport = null;
};

inherits(Forwarder, EE);

Forwarder.prototype.connect = function(port, baudrate)
{
  var self = this;
  if(self.transport !== null) self.disconnect();
  self.transport = new SerialTransport(baudrate, port);

  self.transport.on('ready', function onTransportReady()
    {
      self.emit('ready');
    });

  self.transport.on('data', function onData(data)
    {
      //console.log('Data: ', data);

      // 5 of mqtt-sn forwarder, 2 of lqi and rssi
      if(data.length < 7) return console.log('not enough data');
      var lqi = data[0];
      var rssi = data[1];
      var len = data[2];
      var msgType = data[3];
      if(msgType !== 0xFE) return console.log('bad forwarder msg type');
      var ctrl = data[4];
      var addr = data.readUInt16LE(5);
      var mqttsnFrame = data.slice(7);

      var message = {
          lqi: lqi,
          rssi: rssi,
          len: len,
          msgType: msgType,
          ctrl: ctrl,
          addr: addr,
          mqttsnFrame: mqttsnFrame
        }

      self.emit('data', message);
      
    });
  self.transport.on('crcError', function onCrcError(data){ console.log('crcError', data); });
  self.transport.on('framingError', function onFramingError(data){ console.log('framingError', data); });
  self.transport.on('escapeError', function onEscapeError(data){ console.log('escapeError', data); });

};

Forwarder.prototype.disconnect = function()
{
  var self = this;
  self.transport.removeAllListeners('data');
  self.transport.removeAllListeners('crcError');
  self.transport.removeAllListeners('framingError');
  self.transport.removeAllListeners('escapeError');
  self.transport.close();
};

Forwarder.prototype.send = function(addr, packet)
{
  var self = this;
  // len, msgType, ctrl, addrL, addrH, mqttsnpacket
  var addrL = (addr) & 0xFF;
  var addrH = (addr>>8) & 0xFF;
  var frame = new Buffer([5, 0xFE, 1, addrL, addrH]);
  frame = Buffer.concat([frame, packet]);
  self.transport.write(frame);
};

module.exports = Forwarder;