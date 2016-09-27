'use strict';

var Forwarder = require('./Forwarder');
var Gateway = require('./Gateway');
var GwMonitor = require('./GwMonitor');
var log = require('./Logger');
var program = require('commander');
var pjson = require('./package.json');

function parseBool(s)
{
  if(s === 'false') return false;
  return true;
}

function parseKey(key)
{
  key = key.split(',');
  if(key.length !== 16)
  {
    log.warn("Invalid encryption key received, starting without encryption");
    return null;
  }
  key = key.map((item) => {
    return parseInt(item);
  });
  return key;
}

function parseSubnet(s)
{
  return parseInt(s);
}

program
  .version(pjson.version)
  .option('-v, --verbose [level]', 'Verbosity level for logging (fatal, error, warn, info, debug, trace) [info]', 'info')
  .option('-p, --port [serial port]', 'Serial Port path [/dev/tty.SLAB_USBtoUART]', '/dev/tty.SLAB_USBtoUART')
  .option('-b, --broker [url]', 'MQTT broker URL [http://localhost:1883]', 'http://localhost:1883')
  .option('-u, --allow-unknown-devices [true/false]', 'Allow connection of previously unknown (not paired) devices [true]', parseBool, true)
  .option('-s, --subnet [pan id]', 'PAN subnet number (1 to 254) [1]', parseSubnet, 1)
  .option('-k, --key [16 byte array]', '16 byte encryption key [null]', parseKey, null)
  .parse(process.argv);

log.level(program.verbose);

var forwarder = new Forwarder(program.port, 115200, program.subnet, program.key);

var gw = new Gateway(forwarder);

gw.init(program.broker, program.allowUnknownDevices);

gw.on('ready', function onGwReady()
  {
    var gwMon = new GwMonitor(gw);
    log.info("Gateway Started");
  });

