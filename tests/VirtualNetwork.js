'use strict';

var inherits  = require('util').inherits;
var EE = require('events').EventEmitter;
var async = require('async');
var VirtualDevice = require('./VirtualDevice');
var suspend = require('suspend');

/*
  Events:
    - data

  Current tests:
   two devices on the network
   dev1 connects with will
   dev2 connects without will
    User: check device list from GwMonitor
   dev2 subscribes to topic 'test'
   dev2 subscribes to topic 'test1'
   dev1 subscribes to topic 'test2'
    User: check subscription and topic lists from GwMonitor
   dev1 registers and publishes topic 'test'
    User: check subscription and topic lists from GwMonitor
    User: check that only device 2 gets the message (from terminal, packet prints)
    User: subscribe to topic 'test' from MQTTLens or similar and check correct message reception
   dev2: unsubscribes to topic 'test'
    User: check subscription and topic lists from GwMonitor
   dev2: disconnects
    User: check device lists from GwMonitor
 */

var VirtualNetwork = function()
{
  var self = this;
  self.dev1 = new VirtualDevice(1, self);
  self.dev2 = new VirtualDevice(2, self);
};

inherits(VirtualNetwork, EE);

VirtualNetwork.prototype.init = function()
{
  var self = this;
  // Connect test with will
  suspend.run(function* test1()
    {
      yield setTimeout(suspend.resume(), 1000);
      console.log("\nStarting test 1...");
      self.dev1.connect(true);
      yield self.dev1.waitFor('willtopicreq', suspend.resume());
      self.dev1.willTopic();
      yield self.dev1.waitFor('willmsgreq', suspend.resume());
      self.dev1.willMsg();
      yield self.dev1.waitFor('connack', suspend.resume());
      console.log(":::::::::::Connect Test with will OK");
    });
  // Connect test without will
  suspend.run(function* test2()
    {
      yield setTimeout(suspend.resume(), 2000);
      console.log("\nStarting test 2...");
      self.dev2.connect(false);
      yield self.dev2.waitFor('connack', suspend.resume());
      console.log(":::::::::::Connect Test without will OK");
    });

  // Subscribe test
  suspend.run(function* test3()
    {
      yield setTimeout(suspend.resume(), 3000);
      console.log("\nStarting test 3...");
      self.dev2.subscribe(0, 'normal', 'test'); // qos, topicIdType, topic
      yield self.dev2.waitFor('suback', suspend.resume());
      console.log(":::::::::::Subscribe test OK");
    });

  // Subscribe test
  suspend.run(function* test3_1()
    {
      yield setTimeout(suspend.resume(), 3000);
      console.log("\nStarting test 3.1...");
      self.dev2.subscribe(0, 'normal', 'test1'); // qos, topicIdType, topic
      yield self.dev2.waitFor('suback', suspend.resume());
      console.log(":::::::::::Subscribe test OK");
    });

  // Subscribe test
  suspend.run(function* test3_2()
    {
      yield setTimeout(suspend.resume(), 3000);
      console.log("\nStarting test 3.2...");
      self.dev1.subscribe(0, 'normal', 'test2'); // qos, topicIdType, topic
      yield self.dev1.waitFor('suback', suspend.resume());
      console.log(":::::::::::Subscribe test OK");
    });

  // Publish test
  suspend.run(function* test4()
    {
      yield setTimeout(suspend.resume(), 4000);
      console.log("\nStarting test 4...");
      // Register topic
      self.dev1.register('test');
      yield self.dev1.waitFor('regack', suspend.resume());
      // TODO: get assigned topic id from regack
      self.dev1.publish(0, false, 'normal', 4, 'hola test');  // qos, retain,  topicIdType, topicId, payload
      console.log(":::::::::::Publish test OK");
    });

  // unsubscribe test
  suspend.run(function* test5()
    {
      yield setTimeout(suspend.resume(), 5000);
      console.log("\nStarting test 5...");
      self.dev2.unsubscribe('normal', 'test'); // topicIdType, topic
      yield self.dev2.waitFor('unsuback', suspend.resume());
      console.log(":::::::::::Unsubscribe test OK");
    });

  // disconnect test
  suspend.run(function* test6()
    {
      yield setTimeout(suspend.resume(), 6000);
      console.log("\nStarting test 6...");
      self.dev2.disconnect(null); // duration, null = no duration
      yield self.dev2.waitFor('disconnect', suspend.resume());
      console.log(":::::::::::Disconnect test OK");
    });

};

VirtualNetwork.prototype.send = function(addr, frame)
{
  var self = this;
  //console.log("sending:", frame, addr);
  if(addr === self.dev1.addr) self.dev1.parse(frame);
  if(addr === self.dev2.addr) self.dev2.parse(frame);
};

module.exports = VirtualNetwork;
