'use strict';

var Forwarder = require('./Forwarder');
var Gateway = require('./Gateway');
var GwMonitor = require('./GwMonitor');
var log = require('./Logger');
var program = require('commander');

program
  .version('0.0.1')
  .option('-v, --verbose [level]', 'Verbosity level for logging (fatal, error, warn, info, debug, trace) [info]', 'info')
  .parse(process.argv);

log.level(program.verbose);

var forwarder = new Forwarder("/dev/tty.SLAB_USBtoUART", 115200);

var gw = new Gateway(forwarder);

gw.init('http://localhost:1883');

gw.on('ready', function onGwReady()
  {
    var gwMon = new GwMonitor(gw);
    log.info("Gateway Started");
  });

