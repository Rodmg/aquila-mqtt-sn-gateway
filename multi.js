'use strict';

const MQTTTransport = require('./MQTTTransport');
const GatewayDB = require('./GatewayDB');
const Forwarder = require('./Forwarder');
const Gateway = require('./Gateway');
const GwMonitor = require('./GwMonitor');
const log = require('./Logger');
const program = require('commander');
const pjson = require('./package.json');
const path = require('path');

const mqtt = require('mqtt');

const DEFAULT_DATA_DIR = path.join(process.env[(process.platform === 'win32') ? 'ALLUSERSPROFILE' : 'HOME'], '.aquila-gateway');

const SUBNET = 1;
const KEY = null;
const BROKER = "http://localhost:1883";
const ALLOW_UNKNOWN = true;

class GatewayConnection {

  constructor(udid, broker) {
    this.broker = broker;
    this.udid = udid;
    this.connected = false;
    this.transport = new MQTTTransport(this.broker, 
                                      `${this.udid}/bridge/in`, 
                                      `${this.udid}/bridge/out`);
    this.db = new GatewayDB(path.join(DEFAULT_DATA_DIR, `data-${this.udid}.json`));
    this.forwarder = new Forwarder(this.db, this.transport, SUBNET, KEY);
    this.gw = new Gateway(this.db, this.forwarder);
    this.connect();
  }

  isConnected() {
    return this.isConnected;
  }

  connect() {
    this.gw.init(this.broker, ALLOW_UNKNOWN);

    this.gw.on('ready', () => {
        let gwMon = new GwMonitor(this.gw, `${this.udid}/gw`);
        log.info("Gateway Started");
      });
  }

  disconnect() {
    this.gw.destructor();
    this.db.destructor();
  }

}

class MultiManager {

  constructor(url) {
    this.url = url;

    this.pool = []; // GatewayConnection

    this.connect();
  }

  udidInPool(udid) {
    return this.pool.findIndex((element) => {
      return element.udid === udid;
    });
  }

  connect() {
    if(this.client != null) return; // Already connected
    this.client = mqtt.connect(this.url);

    this.client.on('connect', () => {
        log.debug('Connected to MQTT broker (Multi)');
        this.client.subscribe('+/bridge/connect', { qos: 1 });
        this.client.subscribe('+/disconnect', { qos: 1 });
      });

    this.client.on('offline', () => {
        log.warn('MQTT broker offline (Multi)');
      });

    this.client.on('reconnect', () => {
        log.warn('Trying to reconnect with MQTT broker (Multi)');
      });

    this.client.on('message', (topic, message, packet) => {
      let parsedTopic = topic.split('/');
      let udid = parsedTopic[0];
      let command = parsedTopic[1];
      let subcommand = parsedTopic[2];

      if(command === 'bridge' && subcommand === 'connect') {
        if(this.udidInPool(udid) < 0) {
          // Create new Gateway Connector
          let connector = new GatewayConnection(udid, this.broker);
          this.pool.push(connector);
        }
      }
      else if(command === 'disconnect') {
        let index = this.udidInPool(udid);
        if(index < 0) return;
        let item = this.pool[index];
        item.disconnect();
        this.pool.splice(index, 1); // Remove from pool and delete TODO test if memory freed
      }

    });

  }

}

log.level('debug');

let manager = new MultiManager(BROKER);
