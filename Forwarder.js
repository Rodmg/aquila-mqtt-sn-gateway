'use strict';

var SerialTransport = require('./SerialTransport');
var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var log = require('./Logger');
// For pair address management
var db = require('./GatewayDB');

/*
  Manages connections with bridge and initial parsing

  Events:
    data ({lqi, rssi, addr, mqttsnFrame})
    ready

  Serial frame formats:

    MQTT-SN forwarder: msgType = 0xFE
      len, msgType, ctrl, addrL, addrH, mqttsnpacket
    NACK
      len, 0x00
    ACK:
      len, 0x01
    CONFIG: TODO: implement
      len, 0x02, [encryption key x 16]
    ENTER PAIR:
      len, 0x03, 0x01
    EXIT PAIR
      len, 0x03, 0x00
    PAIR REQ
      len, 0x03, 0x02, addrL, addrH, lenght (3), pair cmd (0x03), randomId
    PAIR RES
      len, 0x03, 0x03, addrL, addrH, lenght (4), pair cmd (0x03), randomId, newAddr (, [encryption key x 16] TODO)

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

  self.pairMode = false;
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
      
      if(self.pairMode) return self.handlePairMode(data);

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

      // If not in pair mode, ignore any message from address 0 (pair mode address)
      if(addr === 0 && !self.pairMode) return;

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

Forwarder.prototype.enterPairMode = function()
{
  var self = this;
  self.pairMode = true;

  var frame = new Buffer([3, 0x03, 0x01]);
  self.frameBuffer.push(frame);
  self.sendNow();
};

Forwarder.prototype.exitPairMode = function()
{
  var self = this;
  self.pairMode = false;

  var frame = new Buffer([3, 0x03, 0x00]);
  self.frameBuffer.push(frame);
  self.sendNow();
};

Forwarder.prototype.getMode = function()
{
  var self = this;
  return self.pairMode ? 'pair' : 'normal';
};

Forwarder.prototype.handlePairMode = function(data)
{
  var self = this;
  if(data.length < 4) return log.error('Forwarder: got message with not enough data');
  var lqi = data[0];
  var rssi = data[1];
  var len = data[2];
  var msgType = data[3];
  if(msgType !== 0x03)
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
  // Parse PAIR REQ
  if(data.length < 10) return log.error('Forwarder: got message with not enough data');
  var ctrl = data[4];
  if(ctrl !== 0x02) return log.error('Forwarder: bad message');
  var addr = data.readUInt16LE(5);
  if(addr !== 0) return log.error('Forwarder: bad address for pair mode');
  //var len = data[7];
  //var paircmd = data [8]; // TODO VALIDATE
  var randomId = data[9]; // For managin when multiple devices try to pair, temporal "addressing"

  // Assing address and send
  var newAddr = db.getNextDeviceAddress();
  if(newAddr === null) return console.log("WARNING: Max registered devices reached...");
  // Create empty device for occupying the new address
  var device = {
    address: newAddr,
    connected: false,
    state: 'disconnected',
    waitingPingres: false,
    lqi: 0,
    rssi: 0,
    duration: 10,
    lastSeen: new Date(),
    willTopic: null,
    willMessage: null,
    willQoS: null,
    willRetain: null
  };
  db.setDevice(device);

  // PAIR RES
  var frame = new Buffer([7, 0x03, 0x03, 0x00, 0x00, 4, 0x03, randomId, newAddr]);
  console.log("Pair RES:", frame);
  self.frameBuffer.push(frame);
  self.sendNow();

  self.exitPairMode();

};

Forwarder.prototype.send = function(addr, packet)
{
  var self = this;

  // Dont allow sending any message out of pair messages in pair mode
  if(self.pairMode) return false;

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