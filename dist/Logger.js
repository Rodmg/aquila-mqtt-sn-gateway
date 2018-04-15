"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bunyan = require("bunyan");
exports.log = bunyan.createLogger({
    name: 'aquila-gateway',
    level: 'trace'
});

//# sourceMappingURL=Logger.js.map
