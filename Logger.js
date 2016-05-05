'use strict';

var bunyan = require('bunyan');

var log = bunyan.createLogger({ 
  name: 'aquila-gateway',
  level: 'trace'
});

module.exports = log;