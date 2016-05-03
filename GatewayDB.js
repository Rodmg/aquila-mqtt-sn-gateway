'use strict';

var loki = require('lokijs');

var GatewayDB = function()
{
  var self = this;
  self.db = new loki();

  // Device and topic id pools
  // Start from 1, protocol implementation in device interpreets 0 as null
  self.deviceIndex = 1;
  self.topicIndex = 1;

  // devices:
  //  address: number
  //  id: string
  //  connected: bool
  //  state: string ('active', 'asleep', 'lost', 'awake', 'disconnected') (for sleep support)
  //  lqi: number
  //  rssi: number
  //  duration: connect ping timeout
  //  lastSeen: last seen time
  //  willTopic: string
  //  willMessage: string
  //  willQoS
  //  willRetain
  self.devices = self.db.addCollection('devices');

  // topics:
  //  device: id
  //  name: string
  //  id: topicId
  //  type: string ('short name', 'normal', 'pre-defined')
  self.topics = self.db.addCollection('topics');

  // subscriptions:
  //  device: id
  //  topic: string   // Should connect with topic name in topics, if not preexistent, create
  //  qos: qos number
  self.subscriptions = self.db.addCollection('subscriptions');

};

GatewayDB.prototype.setDevice = function(device) // update or create, use for adding wills etc.
{
  var found = null; 
  if(device.address !== undefined) found = this.devices.findOne({ address: device.address });
  else if(device.id !== undefined) found = this.devices.findOne({ id: device.id });
  if(!found)
  {
    // create new
    if(!device.id)
    {
      device.id = this.deviceIndex;
      this.deviceIndex++;
    }
    this.devices.insert(device);
  }
  else
  {
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
  var found = this.devices.find();
  return found;
};

GatewayDB.prototype.setTopic = function(deviceIdOrAddress, topic, topicId, type) // accepts id or address as object {id: bla} or {address: bla}
{
  if(typeof(type) === 'undefined' || type === null ) type = 'normal';  // default

  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address === undefined) return false;
    var dev = this.getDeviceByAddr(deviceIdOrAddress.address);
    if(dev) deviceIdOrAddress.id = dev.id;
  }

  var found = this.topics.findOne({ '$and': [{ device: deviceIdOrAddress.id }, { id: topicId }] });

  if(!found)
  {
    if(!topicId)
    {
      topicId = this.topicIndex;
      this.topicIndex++;
    }
    found = {
      device: deviceIdOrAddress.id,
      name: topic,
      id: topicId,
      type: type
    }
    this.topics.insert(found);
  }
  else
  {
    found.device = deviceIdOrAddress.id;
    found.name = topic;
    found.id = topicId;
    found.type = type;
    this.topics.update(found);
  }

  return found;
};

GatewayDB.prototype.getTopic = function(deviceIdOrAddress, idOrName) // {id: } or {name:}
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address === undefined) return false;
    var dev = this.getDeviceByAddr(deviceIdOrAddress.address);
    if(dev) deviceIdOrAddress.id = dev.id;
  }

  var query = { '$and': [ {device: deviceIdOrAddress.id} ] };
  if(idOrName.id !== undefined) query.$and.push({ id: idOrName.id });
  if(idOrName.name !== undefined) query.$and.push({ name: idOrName.name });

  var found = this.topics.findOne(query);
  return found;
};

GatewayDB.prototype.getTopicsFromDevice = function(deviceIdOrAddress)
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address === undefined) return false;
    var dev = this.getDeviceByAddr(deviceIdOrAddress.address);
    if(dev) deviceIdOrAddress.id = dev.id;
  }

  var query = { device: deviceIdOrAddress.id };
  var found = this.topics.find(query);
  return found;
};

GatewayDB.prototype.setSubscription = function(deviceIdOrAddress, topicIdOrName, qos)
{
  if(typeof(qos) === 'undefined' || qos === null) qos = 0;

  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address === undefined) return false;
    var dev = this.getDeviceByAddr(deviceIdOrAddress.address);
    if(dev) deviceIdOrAddress.id = dev.id;
  }

  if(topicIdOrName.name === undefined)
  {
    if(topicIdOrName.id === undefined) return false;
    topicIdOrName.name = this.getTopic({ id: deviceIdOrAddress.id }, { id: topicIdOrName.id }).name;
  }

  var found = this.subscriptions.findOne({ '$and': [ {device: deviceIdOrAddress.id}, {topic: topicIdOrName.name} ] });

  if(!found)
  {
    found = {
      device: deviceIdOrAddress.id,
      topic: topicIdOrName.name,
      qos: qos
    }
    this.subscriptions.insert(found);
  }
  else
  {
    found.device = deviceIdOrAddress.id;
    found.topic = topicIdOrName.name;
    found.qos = qos;
    this.subscriptions.update(found);
  }

  return found;
};

GatewayDB.prototype.getSubscriptionsFromTopic = function(topicName)
{
  var found = this.subscriptions.find({ topic: topicName });
  return found;
};

GatewayDB.prototype.getSubscriptionsFromDevice = function(deviceIdOrAddress)
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address === undefined) return false;
    var dev = this.getDeviceByAddr(deviceIdOrAddress.address);
    if(dev) deviceIdOrAddress.id = dev.id;
  }

  var found = this.subscriptions.find({ device: deviceIdOrAddress.id });
  return found;
};

GatewayDB.prototype.removeSubscriptionsFromDevice = function(deviceIdOrAddress)
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address === undefined) return false;
    var dev = this.getDeviceByAddr(deviceIdOrAddress.address);
    if(dev) deviceIdOrAddress.id = dev.id;
  }
  this.subscriptions.removeWhere({ device: deviceIdOrAddress.id });
};

GatewayDB.prototype.removeSubscription = function(deviceIdOrAddress, topicName, topicType)
{
  if(deviceIdOrAddress.id === undefined)
  {
    if(deviceIdOrAddress.address === undefined) return false;
    var dev = this.getDeviceByAddr(deviceIdOrAddress.address);
    if(dev) deviceIdOrAddress.id = dev.id;
  }

  this.subscriptions.removeWhere({ '$and': [  { device: deviceIdOrAddress.id }, 
                                              { topic: topicName } ] });
  return true;
};

module.exports = GatewayDB;