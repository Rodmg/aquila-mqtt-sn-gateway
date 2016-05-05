'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var VirtualNetwork = require('./VirtualNetwork');
var log = require('./../Logger');

/*
  Dummy Forwarder for testing

  Events:
    data ({lqi, rssi, addr, mqttsnFrame})
    ready

 */

var Forwarder = function()
{
  var self = this;
  self.network = new VirtualNetwork();
  self.network.init();
};

inherits(Forwarder, EE);

Forwarder.prototype.connect = function()
{
  var self = this;
  setTimeout(function()
  {
    self.emit('ready');
  }, 500);

  self.network.on('data', function onData(data)
    {
      //log.trace('Data: ', data);

      var message = {
          lqi: 255,
          rssi: 255,
          len: data.frame.length + 4,
          msgType: 0xFE,
          ctrl: 1,
          addr: data.addr,
          mqttsnFrame: data.frame
        }

      self.emit('data', message);
      
    });

};

Forwarder.prototype.disconnect = function()
{
  var self = this;
  log.trace("Test Forwarder Disconnected");
};

Forwarder.prototype.send = function(addr, packet)
{
  var self = this;
  
  self.network.send(addr, packet);
};

module.exports = Forwarder;