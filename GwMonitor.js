'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;

var GwMonitor = function(gateway)
{
  var self = this;
  self.gateway = gateway;

  self.gateway.client.subscribe('gw/devices/get');
  self.gateway.client.subscribe('gw/subscriptions/get');
  self.gateway.client.subscribe('gw/topics/get');
  self.gateway.client.subscribe('gw/forwarder/enterpair');
  self.gateway.client.subscribe('gw/forwarder/exitpair');
  self.gateway.client.subscribe('gw/forwarder/mode/get');

  self.gateway.client.on('message', function onMqttMessage(topic, message, packet)
    {
      if(topic === 'gw/devices/get')
      {
        var devices = JSON.parse(JSON.stringify(self.gateway.db.getAllDevices()));  // make copy, fixes crash with lokijs
        // Cleanup
        for(var i in devices)
        {
          delete devices[i].meta;
          delete devices[i].$loki;
        }
        self.gateway.client.publish('gw/devices/res', JSON.stringify(devices));
      }

      if(topic === 'gw/subscriptions/get')
      {
        var subscriptions = JSON.parse(JSON.stringify(self.gateway.db.getAllSubscriptions()));  // make copy, fixes crash with lokijs
        // Cleanup
        for(var i in subscriptions)
        {
          delete subscriptions[i].meta;
          delete subscriptions[i].$loki;
        }
        self.gateway.client.publish('gw/subscriptions/res', JSON.stringify(subscriptions));
      }

      if(topic === 'gw/topics/get')
      {
        var topics = JSON.parse(JSON.stringify(self.gateway.db.getAllTopics()));  // make copy, fixes crash with lokijs
        // Cleanup
        for(var i in topics)
        {
          delete topics[i].meta;
          delete topics[i].$loki;
        }
        self.gateway.client.publish('gw/topics/res', JSON.stringify(topics));
      }

      if(topic === 'gw/forwarder/enterpair')
      {
        self.gateway.forwarder.enterPairMode();
      }

      if(topic === 'gw/forwarder/exitpair')
      {
        self.gateway.forwarder.exitPairMode();
      }

      if(topic === 'gw/forwarder/mode/get')
      {
        var mode = self.gateway.forwarder.getMode();
        self.gateway.client.publish('gw/forwarder/mode/res', JSON.stringify({ mode: mode }));
      }

    });

  self.gateway.on("deviceConnected", function onDeviceConnected(device)
    {
      var dev = JSON.parse(JSON.stringify(device));
      delete dev.meta;
      delete dev.$loki;
      self.gateway.client.publish("gw/devices/connected", JSON.stringify(dev));
    });

  self.gateway.on("deviceDisconnected", function onDeviceDisconnected(device)
    {
      var dev = JSON.parse(JSON.stringify(device));
      delete dev.meta;
      delete dev.$loki;
      self.gateway.client.publish("gw/devices/disconnected", JSON.stringify(dev));
    });
}

inherits(GwMonitor, EE);

module.exports = GwMonitor;