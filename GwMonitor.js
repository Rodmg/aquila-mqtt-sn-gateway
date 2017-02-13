'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var log = require('./Logger');

var GwMonitor = function(gateway, prefix)
{
  var self = this;

  // Monitor topics prefix
  self.prefix = prefix;
  if(self.prefix == null) self.prefix = 'gw';

  self.gateway = gateway;

  // "*/get" requests deprecated, please use "*/req" for consistency with "*/res" responses.
  self.gateway.client.subscribe(self.prefix + '/devices/get');
  self.gateway.client.subscribe(self.prefix + '/subscriptions/get');
  self.gateway.client.subscribe(self.prefix + '/topics/get');
  self.gateway.client.subscribe(self.prefix + '/forwarder/mode/get');

  self.gateway.client.subscribe(self.prefix + '/devices/req');
  self.gateway.client.subscribe(self.prefix + '/devices/remove/req');
  self.gateway.client.subscribe(self.prefix + '/subscriptions/req');
  self.gateway.client.subscribe(self.prefix + '/topics/req');
  self.gateway.client.subscribe(self.prefix + '/forwarder/mode/req');
  self.gateway.client.subscribe(self.prefix + '/forwarder/enterpair');
  self.gateway.client.subscribe(self.prefix + '/forwarder/exitpair');

  self.gateway.client.on('message', function onMqttMessage(topic, message, packet)
    {
      if( (topic === self.prefix + '/devices/req') || (topic === self.prefix + '/devices/get') )
      {
        var devices = JSON.parse(JSON.stringify(self.gateway.db.getAllDevices()));  // make copy, fixes crash with lokijs
        // Cleanup
        for(var i in devices)
        {
          delete devices[i].meta;
          delete devices[i].$loki;
        }
        self.gateway.client.publish(self.prefix + '/devices/res', JSON.stringify(devices));
      }

      if(topic === self.prefix + '/devices/remove/req')
      {
        let result = false;
        let device = null;
        try {
          device = JSON.parse(message.toString());
          result = self.gateway.db.removeDevice(device);
        }
        catch (err) {
          log.warn(err);
          result = false;
        }
        let response = {
          success: result
        };
        self.gateway.client.publish(self.prefix + '/devices/remove/res', JSON.stringify(response));
      }

      if( (topic === self.prefix + '/subscriptions/req') || (topic === self.prefix + '/subscriptions/get') )
      {
        var subscriptions = JSON.parse(JSON.stringify(self.gateway.db.getAllSubscriptions()));  // make copy, fixes crash with lokijs
        // Cleanup
        for(var i in subscriptions)
        {
          delete subscriptions[i].meta;
          delete subscriptions[i].$loki;
        }
        self.gateway.client.publish(self.prefix + '/subscriptions/res', JSON.stringify(subscriptions));
      }

      if( (topic === self.prefix + '/topics/req') || (topic === self.prefix + '/topics/get') )
      {
        var topics = JSON.parse(JSON.stringify(self.gateway.db.getAllTopics()));  // make copy, fixes crash with lokijs
        // Cleanup
        for(var i in topics)
        {
          delete topics[i].meta;
          delete topics[i].$loki;
        }
        self.gateway.client.publish(self.prefix + '/topics/res', JSON.stringify(topics));
      }

      if(topic === self.prefix + '/forwarder/enterpair')
      {
        self.gateway.forwarder.enterPairMode();
      }

      if(topic === self.prefix + '/forwarder/exitpair')
      {
        self.gateway.forwarder.exitPairMode();
      }

      if( (topic === self.prefix + '/forwarder/mode/req') || (topic === self.prefix + '/forwarder/mode/get') )
      {
        var mode = self.gateway.forwarder.getMode();
        self.gateway.client.publish(self.prefix + '/forwarder/mode/res', JSON.stringify({ mode: mode }));
      }

    });

  self.gateway.on('deviceConnected', function onDeviceConnected(device)
    {
      var dev = JSON.parse(JSON.stringify(device));
      delete dev.meta;
      delete dev.$loki;
      self.gateway.client.publish(self.prefix + '/devices/connected', JSON.stringify(dev));
    });

  self.gateway.on('deviceDisconnected', function onDeviceDisconnected(device)
    {
      var dev = JSON.parse(JSON.stringify(device));
      delete dev.meta;
      delete dev.$loki;
      self.gateway.client.publish(self.prefix + '/devices/disconnected', JSON.stringify(dev));
    });

  self.gateway.forwarder.on('devicePaired', function onDevicePaired(device)
    {
      var dev = JSON.parse(JSON.stringify(device));
      delete dev.meta;
      delete dev.$loki;
      self.gateway.client.publish(self.prefix + '/devices/paired', JSON.stringify(dev));
    });
}

inherits(GwMonitor, EE);

module.exports = GwMonitor;