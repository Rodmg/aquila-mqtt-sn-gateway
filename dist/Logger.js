"use strict";
const bunyan = require("bunyan");
exports.log = bunyan.createLogger({
    name: 'aquila-gateway',
    level: 'trace'
});

//# sourceMappingURL=Logger.js.map
