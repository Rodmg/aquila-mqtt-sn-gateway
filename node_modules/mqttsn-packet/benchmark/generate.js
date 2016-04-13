
var mqttsn    = require('../'),
    max     = 100000,
    i,
    start   = Date.now(),
    time,
    buf     = new Buffer('test'),
    object  = {
      cmd: 'publish',
      topicIdType: 'normal',
      topicId: 295,
      payload: buf
  };

for (i = 0; i < max; i += 1) {
  mqttsn.generate(object);
}

time = Date.now() - start;
console.log('Total time', time);
console.log('Total packets', max);
console.log('Packet/s', max / time * 1000);
