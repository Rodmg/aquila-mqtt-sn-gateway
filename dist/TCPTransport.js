"use strict";
const Slip = require("node-slip");
const events_1 = require("events");
const net = require("net");
const Logger_1 = require("./Logger");
const CrcUtils_1 = require("./CrcUtils");
class TCPTransport extends events_1.EventEmitter {
    constructor(port) {
        super();
        this.fake = false;
        this.writing = false;
        this.writeBuffer = [];
        this.server = null;
        this.sock = null;
        this.port = port;
        const receiver = {
            data: (input) => {
                let crcOk = CrcUtils_1.checkCrc(input);
                let data = input.slice(0, input.length - 2);
                if (crcOk) {
                    this.emit("data", data);
                }
                else {
                    this.emit("crcError", data);
                }
            },
            framing: (input) => {
                this.emit("framingError", input);
            },
            escape: (input) => {
                this.emit("escapeError", input);
            }
        };
        this.parser = new Slip.parser(receiver);
    }
    connect() {
        if (this.server != null)
            return Promise.reject(new Error('Already connected'));
        Logger_1.log.info("TCP Transport server listening on port", this.port);
        return new Promise((resolve, reject) => {
            this.server = net.createServer((sock) => {
                Logger_1.log.info('TCP client connected: ' + sock.remoteAddress + ':' + sock.remotePort);
                if (this.sock != null) {
                    Logger_1.log.warn('There is a bridge already connected, ignoring new connection');
                    return;
                }
                this.sock = sock;
                this.sock.setKeepAlive(true, 0);
                this.sock.on("data", (data) => {
                    this.parser.write(data);
                });
                this.sock.on("connect", () => {
                    this.emit("ready");
                });
                this.sock.on("error", (err) => {
                    Logger_1.log.debug("Socket error");
                    this.emit("error", err);
                });
                this.sock.on("end", (err) => {
                    Logger_1.log.debug("Socket end");
                    this.emit("disconnect", err);
                    this.sock = null;
                });
                this.sock.on("close", () => {
                    Logger_1.log.debug("Socket close");
                    this.emit("close");
                    this.sock = null;
                });
                this.sock.on("timeout", () => {
                    Logger_1.log.debug("Socket timeout");
                    this.sock.end();
                });
                resolve(null);
            }).listen(this.port);
        });
    }
    close(callback) {
        if (!callback)
            callback = function () { };
        if (this.sock == null)
            return;
        this.sock.close((err) => {
            if (err)
                return callback(err);
        });
    }
    write(data) {
        data = new Buffer(data);
        let crc = CrcUtils_1.calcCrc(data);
        let crcBuf = new Buffer(2);
        crcBuf.writeUInt16LE(crc, 0);
        let buffer = Buffer.concat([data, crcBuf]);
        let slipData = Slip.generator(buffer);
        this.writeBuffer.push(slipData);
        this.writeNow();
    }
    writeNow() {
        if (this.sock == null)
            return;
        if (this.writeBuffer.length <= 0)
            return;
        if (this.writing)
            return;
        this.writing = true;
        if (this.fake) {
            this.writing = false;
            return;
        }
        let data = this.writeBuffer.shift();
        this.sock.write(data);
        this.writing = false;
        if (this.writeBuffer.length > 0)
            this.writeNow();
    }
}
exports.TCPTransport = TCPTransport;

//# sourceMappingURL=TCPTransport.js.map
