'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var Forwarder = require('./Forwarder');
var mqttsn = require('./lib/mqttsn-packet');
var parser = mqttsn.parser();
var mqtt = require('mqtt');

/*
  Manages mqtt-sn messages an protocol logic, forwards to mqtt

  Events:
  TODO
 */

var Gateway = function()
{
  var self = this;
  self.forwarder = new Forwarder();
  self.client = null; 
};

inherits(Gateway, EE);

Gateway.prototype.init = function(mqttUrl, port, baudrate)
{
  var self = this;

  self.connectMqtt(mqttUrl);
  self.forwarder.connect(port, baudrate);

  // data ({lqi, rssi, addr, mqttsnFrame})
  self.forwarder.on('data', function onFwData(data)
    {
      // TODO: What to do with lqi, rssi
      var addr = data.addr;
      parser.parse(data.mqttsnFrame);
    });

  parser.on('packet', function onParserPacket(packet)
    {
      // dbg TODO rewrite with addr awareness
      console.log(packet);
      if(packet.cmd === 'connect')
      {
        var frame = mqttsn.generate({ cmd: 'connack', returnCode: 'Accepted' });
        self.forwarder.send(0xFFFF, frame);
      }
      if(packet.cmd === 'pingreq')
      {
        var frame = mqttsn.generate({ cmd: 'pingresp' });
        self.forwarder.send(0xFFFF, frame);
        console.log(frame);
      }
      // end dbg
    });

  parser.on('error', function(error)
    {
      console.log('mqtt-sn parser error:', error);
    });
};

Gateway.prototype.connectMqtt = function(url)
{
  var self = this;

  self.client = mqtt.connect(url);

  self.client.on('connect', function onMqttConnect()
  {

  });

  self.client.on('message', function onMqttMessage(topic, message)
  {

  });
};

module.exports = Gateway;