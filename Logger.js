'use strict';

const bunyan = require('bunyan');

const log = bunyan.createLogger({ 
  name: 'aquila-gateway',
  level: 'trace'
});

module.exports = log;