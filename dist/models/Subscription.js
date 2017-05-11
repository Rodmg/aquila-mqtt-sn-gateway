"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DataTypes = require("sequelize");
const db_1 = require("./../db");
const Device_1 = require("./Device");
const Topic_1 = require("./Topic");
exports.Subscription = db_1.db.define('subscription', {
    id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    qos: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    classMethods: {
        getAssociations: () => {
            return {
                device: {
                    type: 'belongsTo',
                    model: Device_1.Device,
                    as: 'device',
                    hooks: true
                },
                topic: {
                    type: 'belongsTo',
                    model: Topic_1.Topic,
                    as: 'topic',
                    hooks: true
                }
            };
        }
    },
    instanceMethods: {},
    hooks: {
        beforeBulkCreate(items, options, fn) {
            options.individualHooks = true;
            fn();
        },
        beforeBulkDestroy(options, fn) {
            options.individualHooks = true;
            fn();
        }
    }
});

//# sourceMappingURL=Subscription.js.map
