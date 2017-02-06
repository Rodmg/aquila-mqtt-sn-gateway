
import { TCPTransport } from './TCPTransport';
import { SerialTransport } from './SerialTransport';
import { MQTTTransport } from './MQTTTransport';
import { GatewayDB } from './GatewayDB';
import { Forwarder } from './Forwarder';
import { Gateway } from './Gateway';
import { GwMonitor } from './GwMonitor';
import { log } from './Logger';
import * as program from 'commander';
import * as path  from 'path';
const pjson = require('./../package.json');

function parseBool(s: string)
{
  if(s === 'false') return false;
  return true;
}

function parseKey(key: string)
{
  let keyArr: Array<any> = key.split(',');
  if(keyArr.length !== 16)
  {
    log.warn("Invalid encryption key received, starting without encryption");
    return null;
  }
  keyArr = keyArr.map((item) => {
    return parseInt(item);
  });
  return keyArr;
}

function parseSubnet(s: string)
{
  return parseInt(s);
}

const DEFAULT_DATA_DIR = path.join(process.env[(process.platform === 'win32') ? 'ALLUSERSPROFILE' : 'HOME'], '.aquila-gateway');
const DEFAULT_DATA_PATH = path.join(DEFAULT_DATA_DIR, 'data.json');

program
  .version(pjson.version)
  .option('-v, --verbose [level]', 'Verbosity level for logging (fatal, error, warn, info, debug, trace) [info]', 'info')
  .option('-t, --transport [transport]', 'Forwarder transport type (serial, tcp) [serial]', 'serial')
  .option('-p, --port [serial port]', 'Serial Port path if using serial transport, TCP port number if using TCP transport [/dev/tty.SLAB_USBtoUART | 6969]', '/dev/tty.SLAB_USBtoUART')
  .option('-b, --broker [url]', 'MQTT broker URL [http://localhost:1883]', 'http://localhost:1883')
  .option('-u, --allow-unknown-devices [true/false]', 'Allow connection of previously unknown (not paired) devices [true]', parseBool, true)
  .option('-s, --subnet [pan id]', 'PAN subnet number (1 to 254) [1]', parseSubnet, 1)
  .option('-k, --key [16 byte array]', '16 byte encryption key [null]', parseKey, null)
  .option('-d, --data-path [path]', 'Path to data persist file [' + DEFAULT_DATA_PATH + ']', DEFAULT_DATA_PATH)
  .option('-m, --monitor-prefix [prefix]', 'Gateway monitor topics prefix [gw]', 'gw')
  .parse(process.argv);

log.level(program.verbose);

// Select Forwarder transport
let transport;
if(program.transport === 'tcp')
{
  let tcpPort = parseInt(program.port);
  if(isNaN(tcpPort)) tcpPort = 6969;
  transport = new TCPTransport(tcpPort);
}
else if(program.transport === 'mqtt')
{
  transport = new MQTTTransport(program.broker, 
    "91bbef0fa64c130d0b274c7299c424/bridge/in", 
    "91bbef0fa64c130d0b274c7299c424/bridge/out");
}
else
{
  transport = new SerialTransport(115200, program.port);
}

let db = new GatewayDB(program.dataPath);

db.connect().then(() => {
  let forwarder = new Forwarder(db, transport, program.subnet, program.key);

  let gw = new Gateway(db, forwarder);

  gw.init(program.broker, program.allowUnknownDevices);

  gw.on('ready', function onGwReady()
    {
      let gwMon = new GwMonitor(gw, program.monitorPrefix);
      log.info("Gateway Started");
    });
});


