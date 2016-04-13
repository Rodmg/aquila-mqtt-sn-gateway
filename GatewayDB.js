'use strict';

var loki = require('loki');

var GatewayDB = function()
{
  var self = this;
  self.db = new loki();

  // devices:
  //  address: number
  //  id: string
  //  connected: bool
  //  lqi: number
  //  rssi: number
  //  duration: connect ping timeout
  //  willTopic: string
  //  willMessage: string
  self.devices = self.db.addCollection('devices');

  // topics:
  //  device: id
  //  name: string
  //  id: topicId
  self.topics = self.db.addCollection('topics');

  // subscriptions:
  //  device: id
  //  topic: string   // Should connect with topic id in topics, if not preexistent, create
  self.subscriptions = self.db.addCollection('subscriptions');

};

GatewayDB.prototype.setDevice = function(device) // update or create, use for adding wills etc.
{
  var found = null; 
  if(device.address) found = device.findOne({ address: device.address });
  else if(device.id) found = device.findOne({ id: device.id });
  if(!found)
  {
    // create new
    this.devices.insert(device);
  }
  else
  {
    found = {};
    // update
    if(device.address !== undefined) found.address = device.address;
    if(device.id !== undefined) found.id = device.id;
    if(device.connected !== undefined) found.connected = device.connected;
    if(device.lqi !== undefined) found.lqi = device.lqi;
    if(device.rssi !== undefined) found.rssi = device.rssi;
    if(device.duration !== undefined) found.duration = device.duration;
    if(device.willTopic !== undefined) found.willTopic = device.willTopic;
    if(device.willMessage !== undefined) found.willMessage = device.willMessage;
    this.devices.update(found);
  }
  return found;
};

GatewayDB.prototype.getDeviceByAddr = function(addr)
{
  var found = this.devices.findOne({ address: addr });
  return found;
};

GatewayDB.prototype.getDeviceById = function(id)
{
  var found = this.devices.findOne({ id: id });
  return found;
};

GatewayDB.prototype.getAllDevices = function()
{
  var found = this.devices.find();  // TODO: test
  return found;
};

GatewayDB.prototype.setTopic = function(deviceIdOrAddress, topic, topicId) // accepts id or address as object {id: bla} or {address: bla}
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address ==== undefined) return false;
    deviceIdOrAddress.id = this.getDeviceByAddr(deviceIdOrAddress.address);
  }

  var found = this.topics.findOne({ device: deviceIdOrAddress.id });

  if(!found)
  {
    found = {
      device: deviceIdOrAddress.id,
      name: topic,
      id: topicId
    }
    this.topics.insert(found);
  }
  else
  {
    found.device = deviceIdOrAddress.id;
    found.name = topic;
    found.id = topicId;
    this.topics.update(found);
  }

  return found;
};

GatewayDB.prototype.getTopic = function(deviceIdOrAddress, idOrName) // {id: } or {name:}
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address ==== undefined) return false;
    deviceIdOrAddress.id = this.getDeviceByAddr(deviceIdOrAddress.address);
  }

  var query = { device: deviceIdOrAddress.id };
  if(idOrName.id) query.id = idOrName.id;
  if(idOrName.name) query.name = idOrName.name;

  var found = this.topics.findOne(query);
  return found;
};

GatewayDB.prototype.getTopicsFromDevice = function(deviceIdOrAddress)
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address ==== undefined) return false;
    deviceIdOrAddress.id = this.getDeviceByAddr(deviceIdOrAddress.address);
  }

  var query = { device: deviceIdOrAddress.id };
  var found = this.topics.find(query);
  return found;
};

GatewayDB.setSubscription = function(deviceIdOrAddress, topicIdOrName)
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address ==== undefined) return false;
    deviceIdOrAddress.id = this.getDeviceByAddr(deviceIdOrAddress.address);
  }

  if(topicIdOrName.name === undefined)
  {
    if(topicIdOrName.id ==== undefined) return false;
    topicIdOrName.name = this.getTopic({ id: deviceIdOrAddress.id }, { id: topicIdOrName.id }).name;
  }

  var found = this.subscriptions.findOne({ device: deviceIdOrAddress.id, topic: topicIdOrName.name });

  if(!found)
  {
    found = {
      device: deviceIdOrAddress.id,
      topic: topicIdOrName.name,
    }
    this.subscriptions.insert(found);
  }
  else
  {
    found.device = deviceIdOrAddress.id;
    found.topic = topicIdOrName.name;
    this.subscriptions.update(found);
  }

  return found;
};

GatewayDB.getSubscriptionsFromTopic = function(topicName)
{
  var found = this.subscriptions.find({ topic: topicName });
  return found;
};

GatewayDB.getSubscriptionsFromDevice = function(deviceIdOrAddress)
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address ==== undefined) return false;
    deviceIdOrAddress.id = this.getDeviceByAddr(deviceIdOrAddress.address);
  }

  var found = this.subscriptions.find({ device: deviceIdOrAddress.id });
  return found;
};