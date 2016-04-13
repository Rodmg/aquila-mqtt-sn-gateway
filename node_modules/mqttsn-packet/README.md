mqttsn-packet&nbsp;&nbsp;&nbsp;[![Build Status](https://travis-ci.org/ithinuel/mqttsn-packet.svg?branch=master)](https://travis-ci.org/ithinuel/mqttsn-packet)
==========

Encode and Decode MQTT-SN 1.2 packets.
It is freely inspired from [mqttjs/mqtt-packet](https://github.com/mqttjs/mqtt-packet).

  * <a href="#install">Install</a>
  * <a href="#examples">Examples</a>
  * <a href="#license">Licence &amp; copyright</a>

Install
-------
```bash
npm install mqttsn-packet --save
```

Examples
--------

### Generating
```js
var mqttsn  = require('mqttsn-packet'),
    object  = {
      cmd: 'connect',
      will: true,
      cleanSession: true,
      duration: 1800,
      clientId: 'test'
    };

console.log(mqttsn.generate(object));
// prints
// <Buffer 0a 04 0c 01 07 08 74 65 73 74>
// as :
// new Buffer([
//   10, 4, // header
//   12, 1, // flags & protocolId
//   7, 8,  // duration : 1800 seconds
//   116, 101, 115, 116 // client Id : test
// ])
```

### Parsing
```js
var mqttsn  = require('mqttsn-packet'),
    parser  = mqttsn.parser();

parser.on('packet', function (packet) {
  console.log(packet);
  // prints :
  // Packet {
  //   cmd: 'connect',
  //   will: true,
  //   cleanSession: true,
  //   duration: 1800,
  //   clientId: 'test' }
});

parser.parse(new Buffer([
  10, 4, // header
  12, 1, // flags & protocolId
  7, 8,  // duration : 1800 seconds
  116, 101, 115, 116 // client Id : test
]));
// returns the number of bytes left in the parser
```

License
-------
MIT
