var mqttsn  = require('../'),
    parser  = mqttsn.parser(),
    max     = 10000000,
    i,
    start   = Date.now(),
    time,
    buf     = new Buffer([
  18, 4,  // header
  12, 1,   // flags & protocolId
  14, 16,  // duration
  116, 101, 115, 116, 67, 108, 105, 101, 110, 116, 73, 100
]);

for (i = 0; i < max; i += 1) {
  parser.parse(buf);
}

time = Date.now() - start;
console.log('Total time', time);
console.log('Total packets', max);
console.log('Packet/s', max / time * 1000);
