'use strict';

var test    = require('tape'),
    mqttsn  = require('./');

function testParseGenerate(name, object, buffer, opts, expect) {
  test(name + ' parse', function(t) {
    t.plan(2);

    var parser    = mqttsn.parser(opts),
        expected  = expect || object,
        fixture   = buffer;

    parser.on('packet', function(packet) {
      t.deepEqual(packet, expected, 'expected packet');
    });
    parser.on('error', function (error) {
      t.error(error);
    });

    try {
      t.equal(parser.parse(fixture), 0, 'remaining bytes');
    } catch(e) {
      t.error(e);
    }
    t.timeoutAfter(20);
  });

  test(name + ' generate', function(t) {
    t.plan(1);
    try {
      t.equal(mqttsn.generate(object).toString('hex'), buffer.toString('hex'));
    } catch (e) {
      t.error(e);
    }
  });

  test(name + ' mirror', function(t) {
    t.plan(2);

    var parser    = mqttsn.parser(opts),
        expected  = expect || object,
        fixture;

    parser.on('packet', function(packet) {
      t.deepEqual(packet, expected, 'expected packet');
    });
    parser.on('error', function (error) {
      t.error(error);
    });

    try {
      fixture = mqttsn.generate(object);
      t.equal(parser.parse(fixture), 0, 'remaining bytes');
    } catch (e) {
      t.error(e);
    }
    t.timeoutAfter(20);
  });
}

function testParseError(expected, fixture, message) {
  test(expected, function(t) {
    t.plan(2);

    var parser = mqttsn.parser();
    parser.on('error', function(err) {
      t.equal(err.message, message, 'expected error message');
    });
    try {
      t.equal(parser.parse(fixture), 0, 'remaining bytes');
    } catch (e) {
      t.error(e);
    }
    t.timeoutAfter(20);
  });
}

function testGenerateError(expected, object, fixture) {
  test(expected, function (t) {
    t.plan(1);
    try {
      var buffer = mqttsn.generate(object);
      t.fail('generate was expected to fail but get ' + buffer.toString('hex'));
    } catch (e) {
      t.equal(e.message, fixture, 'expected error message');
    }
  });
}

testParseError('parse command not supported', new Buffer([
  2, 248 // header
]), 'command not supported');

testGenerateError('generate command not supported', {
  cmd: 'bibapbeloola'
}, 'command not supported');

testParseGenerate('advertise', {
  cmd: 'advertise',
  gwId: 34,
  duration: 3600
}, new Buffer([
  5, 0, // Header
  34, // Gateway Id
  14, 16 // Duration
]));

testParseGenerate('searchgw', {
  cmd: 'searchgw',
  radius: 85
}, new Buffer([
  3, 1, // Header
  85, // radius
]));

testParseGenerate('gwinfo as server', {
  cmd: 'gwinfo',
  gwId: 34,
  gwAdd: new Buffer([48, 24])
}, new Buffer([
  3, 2, // Header
  34, // Gateway Id
]), {}, {
  cmd: 'gwinfo',
  gwId: 34
});

testParseGenerate('gwinfo as client', {
  cmd: 'gwinfo',
  gwId: 34,
  gwAdd: new Buffer([48, 24]),
  isClient: true
}, new Buffer([
  6, 2,     // Header
  34,       // Gateway Id
  2, 48, 24 // Gateway address
]), {
  isClient: true
}, {
  cmd: 'gwinfo',
  gwId: 34,
  gwAdd: new Buffer([48, 24])
});

testParseGenerate('connect', {
  cmd: 'connect',
  will: true,
  cleanSession: true,
  duration: 3600,
  clientId: 'testClientId'
}, new Buffer([
  18, 4,  // header
  12, 1,   // flags & protocolId
  14, 16,  // duration
  116, 101, 115, 116, 67, 108, 105, 101, 110, 116, 73, 100
]));

testParseGenerate('connack', {
  cmd: 'connack',
  returnCode: 'Accepted'
}, new Buffer([
  3, 5, // header
  0     // return code
]));

testParseGenerate('willtopicreq', {
  cmd: 'willtopicreq'
}, new Buffer([
  2, 6, // header
]));

testParseGenerate('empty willtopic', {
  cmd: 'willtopic',
}, new Buffer([
  2, 7, // header
]));

testParseGenerate('willtopic', {
  cmd: 'willtopic',
  qos: 1,
  retain: true,
  willTopic: 'hello/world'
}, new Buffer([
  14, 7,  // header
  48,     // flags
  104, 101, 108, 108, 111, 47, 119, 111, 114, 108, 100
]));

testParseGenerate('empty willmsg', {
  cmd: 'willmsg',
  willMsg: ''
}, new Buffer([
  2, 9,  // header
]));

testParseGenerate('willmsg', {
  cmd: 'willmsg',
  willMsg: 'helloworld'
}, new Buffer([
  12, 9,  // header
  104, 101, 108, 108, 111, 119, 111, 114, 108, 100
]));

testParseGenerate('register', {
  cmd: 'register',
  topicId: 294,
  msgId: 24,
  topicName: 'hello/world'
}, new Buffer([
  17, 10,  // header
  1, 38,
  0, 24,
  104, 101, 108, 108, 111, 47, 119, 111, 114, 108, 100
]));

testParseGenerate('regack', {
  cmd: 'regack',
  topicId: 294,
  msgId: 24,
  returnCode: 'Rejected: congestion'
}, new Buffer([
  7, 11,  // header
  1, 38,
  0, 24,
  1
]));

testParseGenerate('publish on normal topicId', {
  cmd: 'publish',
  dup: true,
  qos: 1,
  retain: true,
  topicIdType: 'normal',
  topicId: 294,
  msgId: 24,
  payload: new Buffer('{"test":"bonjour"}')
}, new Buffer([
  25, 12,  // header
  176,    // flags
  1, 38,  // topicId
  0, 24,  // msgId
  0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a, 0x22, 0x62, 0x6f, 0x6e, 0x6a, 0x6f, 0x75, 0x72, 0x22, 0x7d
]));

testParseGenerate('publish on pre-defined topicId', {
  cmd: 'publish',
  dup: true,
  qos: 1,
  retain: true,
  topicIdType: 'pre-defined',
  topicId: 294,
  msgId: 24,
  payload: new Buffer('{"test":"bonjour"}')
}, new Buffer([
  25, 12,  // header
  177,    // flags
  1, 38,  // topicId
  0, 24,  // msgId
  0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a, 0x22, 0x62, 0x6f, 0x6e, 0x6a, 0x6f, 0x75, 0x72, 0x22, 0x7d
]));

testParseGenerate('publish on short topic', {
  cmd: 'publish',
  dup: true,
  qos: 1,
  retain: true,
  topicIdType: 'short topic',
  topicId: 'ab',
  msgId: 24,
  payload: new Buffer('{"test":"bonjour"}')
}, new Buffer([
  25, 12,  // header
  178,    // flags
  97, 98,  // topicId
  0, 24,  // msgId
  0x7b, 0x22, 0x74, 0x65, 0x73, 0x74, 0x22, 0x3a, 0x22, 0x62, 0x6f, 0x6e, 0x6a, 0x6f, 0x75, 0x72, 0x22, 0x7d
]));

testGenerateError('short topic is too long', {
  cmd: 'publish',
  dup: true,
  qos: 1,
  retain: true,
  topicIdType: 'short topic',
  topicId: 'àé',
  msgId: 24
}, 'short topic must be exactly 2 bytes long');

testParseGenerate('puback', {
  cmd: 'puback',
  topicId: 240,
  msgId: 523,
  returnCode: 'Rejected: congestion'
}, new Buffer([
  7, 13,  // header
  0, 240, // topicId
  2, 11,  // msgId
  1       // return code
]));

testParseGenerate('pubcomp', {
  cmd: 'pubcomp',
  msgId: 523
}, new Buffer([
  4, 14, // header
  2, 11, // msgId
]));

testParseGenerate('subcribe', {
  cmd: 'subscribe',
  dup: true,
  qos: 1,
  msgId: 523,
  topicIdType: 'normal',
  topicName: 'hello/world'
}, new Buffer([
  16, 18, // header
  160,    // flags
  2, 11,  // msgId
  104, 101, 108, 108, 111, 47, 119, 111, 114, 108, 100
]));

testParseGenerate('suback', {
  cmd: 'suback',
  qos: 1,
  topicId: 523,
  msgId: 302,
  returnCode: 'Accepted'
}, new Buffer([
  8, 19,  // header
  32,    // flags
  2, 11,  // topicId
  1, 46,  // msgId
  0       // returnCode
]));

testParseGenerate('pingreq', {
  cmd: 'pingreq',
  clientId: 'jean-michel'
}, new Buffer([
  13, 22,  // header
  106, 101, 97, 110, 45, 109, 105, 99, 104, 101, 108
]));

testParseGenerate('disconnect', {
  cmd: 'disconnect',
  duration: 3600
}, new Buffer([
  4, 24,  // header
  14, 16
]));
