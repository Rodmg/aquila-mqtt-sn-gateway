"use strict";
const TCPTransport_1 = require("./TCPTransport");
const SerialTransport_1 = require("./SerialTransport");
const MQTTTransport_1 = require("./MQTTTransport");
const GatewayDB_1 = require("./GatewayDB");
const Forwarder_1 = require("./Forwarder");
const Gateway_1 = require("./Gateway");
const GwMonitor_1 = require("./GwMonitor");
const Logger_1 = require("./Logger");
const program = require("commander");
const path = require("path");
const pjson = require('./../package.json');
function parseBool(s) {
    if (s === 'false')
        return false;
    return true;
}
function parseKey(key) {
    let keyArr = key.split(',');
    if (keyArr.length !== 16) {
        Logger_1.log.warn("Invalid encryption key received, starting without encryption");
        return null;
    }
    keyArr = keyArr.map((item) => {
        return parseInt(item);
    });
    return keyArr;
}
function parseSubnet(s) {
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
Logger_1.log.level(program.verbose);
let transport;
if (program.transport === 'tcp') {
    let tcpPort = parseInt(program.port);
    if (isNaN(tcpPort))
        tcpPort = 6969;
    transport = new TCPTransport_1.TCPTransport(tcpPort);
}
else if (program.transport === 'mqtt') {
    transport = new MQTTTransport_1.MQTTTransport(program.broker, "91bbef0fa64c130d0b274c7299c424/bridge/in", "91bbef0fa64c130d0b274c7299c424/bridge/out");
}
else {
    transport = new SerialTransport_1.SerialTransport(115200, program.port);
}
let db = new GatewayDB_1.GatewayDB(program.dataPath);
let gw;
db.connect()
    .then(() => {
    let forwarder = new Forwarder_1.Forwarder(db, transport, program.subnet, program.key);
    gw = new Gateway_1.Gateway(db, forwarder);
    return gw.init(program.broker, program.allowUnknownDevices);
})
    .then(() => {
    let gwMon = new GwMonitor_1.GwMonitor(gw, program.monitorPrefix);
    Logger_1.log.info("Gateway Started");
});

//# sourceMappingURL=main.js.map
