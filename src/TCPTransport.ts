// TCPTransport.js

import * as Slip from 'node-slip';
import { EventEmitter } from 'events';
import * as net from 'net';
import { log } from './Logger';
import { calcCrc, checkCrc } from './CrcUtils';
import { TransportInterface } from './interfaces';

export class TCPTransport extends EventEmitter implements TransportInterface {

  fake: boolean = false;
  port: number;
  // Serial port write buffer control
  writing: boolean = false;
  writeBuffer: Array<any> = [];

  parser: any;
  server: any = null;
  sock: any = null;

  constructor(port: number) {
    super();

    this.port = port;

    const receiver = {
      data: (input: Buffer) => {
        // Check CRC
        let crcOk = checkCrc(input);
        // Strip CRC data
        let data = input.slice(0, input.length - 2);

        if(crcOk) {
          this.emit("data", data);
        }
        else {
          this.emit("crcError", data);
        }
      },
      framing: (input: Buffer) => {
        this.emit("framingError", input);
      },
      escape: (input: Buffer) => {
        this.emit("escapeError", input);
      }
    };

    this.parser = new Slip.parser(receiver);
  }

  connect(): Promise<void> {
    if(this.server != null) return Promise.reject(new Error('Already connected')); // Already connected
    
    log.info("TCP Transport server listening on port", this.port);

    return new Promise<void>((resolve, reject) => {
      this.server = net.createServer((sock) => {
        log.info('TCP client connected: ' + sock.remoteAddress +':'+ sock.remotePort);
        if(this.sock != null) {
          log.warn('There is a bridge already connected, ignoring new connection');
          return;
        }

        this.sock = sock;

        // TODO: Keep alive not working, try: https://www.npmjs.com/package/net-keepalive
        //this.sock.setTimeout(10000);
        this.sock.setKeepAlive(true, 0);

        this.sock.on("data", (data: any) => {
          this.parser.write(data);
        });

        this.sock.on("connect", () => {
          this.emit("ready");
        });

        this.sock.on("error", (err: any) => {
          log.debug("Socket error");
          this.emit("error", err);
        });

        this.sock.on("end", (err: any) => {
          log.debug("Socket end");
          this.emit("disconnect", err);
          this.sock = null;
        });

        this.sock.on("close", () => {
          log.debug("Socket close");
          this.emit("close");
          this.sock = null;
        });

        this.sock.on("timeout", () => {
          log.debug("Socket timeout");
          this.sock.end();
        });

        resolve(null);

      }).listen(this.port);
    });
    
  }

  close(callback: Function) {
    if(!callback) callback = function(){};
    if(this.sock == null) return;
    this.sock.close((err: any) => {
      if(err) return callback(err);  
    });
  }

  write(data: any) {
    data = new Buffer(data);
    // Append CRC
    let crc = calcCrc(data);
    let crcBuf = new Buffer(2);

    crcBuf.writeUInt16LE(crc, 0);

    let buffer = Buffer.concat([data, crcBuf]);

    // Convert to Slip
    let slipData = Slip.generator(buffer);

    this.writeBuffer.push(slipData);
    this.writeNow();
  }

  writeNow() {
    if(this.sock == null) return;

    // Nothing to do here
    if(this.writeBuffer.length <= 0) return;
    // We are busy, do nothing
    if(this.writing) return;
    this.writing = true;

    // do nothing if we are in fake mode
    if(this.fake) { this.writing = false; return; }


    let data = this.writeBuffer.shift();
    this.sock.write(data);

    //if(config.debug) console.log("Sending:", data);

    this.writing = false;
    if(this.writeBuffer.length > 0) this.writeNow();
  }

}
