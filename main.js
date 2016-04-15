'use strict';

var Gateway = require('./Gateway');

var gw = new Gateway();

gw.init('http://localhost:1883', "/dev/tty.SLAB_USBtoUART", 115200);

console.log("Gateway Started");