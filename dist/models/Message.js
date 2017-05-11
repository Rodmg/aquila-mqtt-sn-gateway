"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DataTypes = require("sequelize");
const db_1 = require("./../db");
const Device_1 = require("./Device");
const Topic_1 = require("./Topic");
exports.Message = db_1.db.define('message', {
    id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    message: {
        type: DataTypes.STRING,
        allowNull: false
    },
    msgId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    dup: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    retain: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    qos: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    topicIdType: {
        type: DataTypes.ENUM('short name', 'normal', 'pre-defined'),
        allowNull: false,
        defaultValue: 'normal'
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

//# sourceMappingURL=Message.js.map
