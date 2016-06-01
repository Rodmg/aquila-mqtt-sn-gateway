'use strict';

var SerialTransport = require('./SerialTransport');
var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var log = require('./Logger');

/*
  Manages connections with bridge and initial parsing

  Events:
    data ({lqi, rssi, addr, mqttsnFrame})
    ready

  TODO: add not connected state management
 */

var ACKTIMEOUT = 5000;
var MAX_BUFFER_ALLOWED = 10;

var Forwarder = function(port, baudrate)
{
  var self = this;
  self.transport = null;
  self.readyToSend = true;
  self.frameBuffer = [];
  self.ackTimeout = null;

  self.port = port;
  self.baudrate = baudrate;
};

inherits(Forwarder, EE);

Forwarder.prototype.connect = function(port, baudrate)
{
  var self = this;

  if(typeof(port) !== 'undefined' && port !== null) self.port = port;
  if(typeof(baudrate) !== 'undefined' && baudrate !== null) self.baudrate = baudrate;

  if(self.transport !== null) self.disconnect();
  self.transport = new SerialTransport(self.baudrate, self.port);

  self.transport.on('ready', function onTransportReady()
    {
      self.emit('ready');
    });

  self.transport.on('data', function onData(data)
    {
      //log.trace('Data: ', data);

      // 5 of mqtt-sn forwarder, 2 of lqi and rssi
      if(data.length < 4) return log.error('Forwarder: got message with not enough data');
      var lqi = data[0];
      var rssi = data[1];
      var len = data[2];
      var msgType = data[3];
      if(msgType !== 0xFE)
      {
        if(msgType === 0x00)
        {
          // NACK
          //console.log("NACK");
          self.readyToSend = true;
          clearTimeout(self.ackTimeout);
          self.sendNow(); // Send any remaining messages
        }
        else if(msgType === 0x01)
        {
          // ACK
          //console.log("ACK");
          self.readyToSend = true;
          clearTimeout(self.ackTimeout);
          self.sendNow(); // Send any remaining messages
        }
        else return log.error('Forwarder: bad forwarder msg type');
        return;
      } 
      if(data.length < 7) return log.error('Forwarder: got message with not enough data');
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
  self.transport.on('crcError', function onCrcError(data){ log.error('crcError', data); });
  self.transport.on('framingError', function onFramingError(data){ log.error('framingError', data); });
  self.transport.on('escapeError', function onEscapeError(data){ log.error('escapeError', data); });

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

  // Check for max buffer allowed
  if(self.frameBuffer.length >= MAX_BUFFER_ALLOWED)
  {
    log.trace('Forwarder buffer full, packet dropped');
    self.sendNow();
    return false;
  }

  // len, msgType, ctrl, addrL, addrH, mqttsnpacket
  var addrL = (addr) & 0xFF;
  var addrH = (addr>>8) & 0xFF;
  var frame = new Buffer([5, 0xFE, 1, addrL, addrH]);
  frame = Buffer.concat([frame, packet]);
  self.frameBuffer.push(frame);
  self.sendNow();

  return true;
};

Forwarder.prototype.sendNow = function()
{
  var self = this;
  if(!self.readyToSend) return;
  var frame = self.frameBuffer.shift();
  if(typeof(frame) === 'undefined') return;
  self.readyToSend = false;
  self.transport.write(frame);
  self.ackTimeout = setTimeout(function ackTimeout()
    {
      self.readyToSend = true;
    }, ACKTIMEOUT);
}

module.exports = Forwarder;