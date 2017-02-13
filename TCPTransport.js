// TCPTransport.js
"use strict";

var util = require("util");
var Slip = require("node-slip");
var events = require("events");
var net = require('net');
var log = require('./Logger');

// CRC algorithm based on Xmodem AVR code
var calcCrc = function(data)
{
  var crc = 0;
  var size = data.length;
  var i;
  var index = 0;

  while(--size >= 0)
  {
    crc = (crc ^ data[index++] << 8) & 0xFFFF;
    i = 8;
    do
    {
      if(crc & 0x8000)
      {
        crc = (crc << 1 ^ 0x1021) & 0xFFFF;
      }
      else
      {
        crc = (crc << 1) & 0xFFFF;
      }
    } while(--i);
  }

  return crc & 0xFFFF;
};

var checkCrc = function(data)
{
  var dataCrc, calcdCrc;
  // Getting crc from packet
  dataCrc = (data[data.length - 1]) << 8;
  dataCrc |= (data[data.length - 2]) & 0x00FF;
  // Calculating crc
  calcdCrc = calcCrc(data.slice(0, data.length - 2));
  // Comparing
  return calcdCrc === dataCrc;
};

var TCPTransport = function(port)
{
  var self = this;
  self.noBind = true;
  self.fake = false;
  self.alreadyReady = false;

  self.port = port;

  // Serial port write buffer control
  self.writing = false;
  self.writeBuffer = [];

  var receiver = {
    data: function(input)
    {
      // Check CRC
      var crcOk = checkCrc(input);
      // Strip CRC data
      var data = input.slice(0, input.length - 2);

      if(crcOk)
      {
        self.emit("data", data);
      }
      else
      {
        self.emit("crcError", data);
      }
      
    },
    framing: function( input ) 
    {
      self.emit("framingError", input);
    },
    escape: function( input )
    {
      self.emit("escapeError", input);
    }
  };

  self.parser = new Slip.parser(receiver);

};

util.inherits(TCPTransport, events.EventEmitter);

TCPTransport.prototype.connect = function()
{
	var self = this;
	if(self.server != null) return;	// Already connected
	self.server = net.createServer(function(sock) {
  	log.info('TCP client connected: ' + sock.remoteAddress +':'+ sock.remotePort);
  	if(self.sock != null)
  	{
  		log.warn('There is a bridge already connected, ignoring new connection');
  		return;
  	}

  	self.sock = sock;

  	// TODO: Keep alive not working, try: https://www.npmjs.com/package/net-keepalive
  	//self.sock.setTimeout(10000);
  	self.sock.setKeepAlive(true, 0);

  	self.sock.on("data", function(data)
  	{
  	  self.parser.write(data);
  	});

  	self.sock.on("connect", function()
  	{
  	  self.emit("ready");
  	});

  	self.sock.on("error", function(err)
  	{
  		log.debug("Socket error");
  	  self.emit("error", err);
  	});

  	self.sock.on("end", function(err)
  	{
  		log.debug("Socket end");
  	  self.emit("disconnect", err);
  	  self.sock = null;
  	});

  	self.sock.on("close", function()
  	{
  		log.debug("Socket close");
  	  self.emit("close");
  	  self.sock = null;
  	});

  	self.sock.on("timeout", function()
		{
			log.debug("Socket timeout");
			self.sock.end();
		});

  	if(!self.alreadyReady) self.emit("ready");
  	self.alreadyReady = true;
  }).listen(self.port);
  log.info("TCP Transport server listening on port", self.port);
};

TCPTransport.prototype.close = function(callback)
{
  if(!callback) callback = function(){};
  var self = this;
  if(self.sock == null) return;
  self.sock.close(function(err)
  {
    if(err) return callback(err);  
  });
};

TCPTransport.prototype.write = function(data)
{
  var self = this;

  data = new Buffer(data);
  // Append CRC
  var crc = calcCrc(data);
  var crcBuf = new Buffer(2);

  crcBuf.writeUInt16LE(crc, 0);

  var buffer = Buffer.concat([data, crcBuf]);

  // Convert to Slip
  var slipData = Slip.generator(buffer);

  self.writeBuffer.push(slipData);
  self.writeNow();
};

TCPTransport.prototype.writeNow = function()
{
  var self = this;

  if(self.sock == null) return;

  // Nothing to do here
  if(self.writeBuffer.length <= 0) return;
  // We are busy, do nothing
  if(self.writing) return;
  self.writing = true;

  // do nothing if we are in fake mode
  if(self.fake) { self.writing = false; return; }


  var data = self.writeBuffer.shift();
  self.sock.write(data);

  //if(config.debug) console.log("Sending:", data);

  self.writing = false;
  if(self.writeBuffer.length > 0) self.writeNow();
};

module.exports = TCPTransport;