'use strict';

var GatewayDB = require('./../GatewayDB');
var Forwarder = require('./TestForwarder');
var Gateway = require('./../Gateway');
var GwMonitor = require('./../GwMonitor');
var log = require('./../Logger');
var program = require('commander');
var pjson = require('./../package.json');
var path = require('path');

var DEFAULT_DATA_DIR = path.join(process.env[(process.platform === 'win32') ? 'ALLUSERSPROFILE' : 'HOME'], '.aquila-gateway');
var DEFAULT_DATA_PATH = path.join(DEFAULT_DATA_DIR, 'data.json');

program
  .version(pjson.version)
  .option('-v, --verbose [level]', 'Verbosity level for logging (fatal, error, warn, info, debug, trace) [debug]', 'debug')
  .option('-d, --data-path [path]', 'Path to data persist file [' + DEFAULT_DATA_PATH + ']', DEFAULT_DATA_PATH)
  .parse(process.argv);

log.level(program.verbose);

var db = new GatewayDB(program.dataPath);

var forwarder = new Forwarder();

var gw = new Gateway(db, forwarder);

gw.init('http://localhost:1883', true);

gw.on('ready', function onGwReady()
  {
    var gwMon = new GwMonitor(gw);
    log.info("Gateway Started");
  });

