"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DataTypes = require("sequelize");
const db_1 = require("./../db");
const Message_1 = require("./Message");
const Subscription_1 = require("./Subscription");
const Topic_1 = require("./Topic");
exports.Device = db_1.db.define('device', {
    id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    address: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false
    },
    clientId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    connected: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    state: {
        type: DataTypes.ENUM('active', 'asleep', 'lost', 'awake', 'disconnected'),
        allowNull: false,
        defaultValue: 'disconnected'
    },
    waitingPingres: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    lqi: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true
    },
    rssi: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true
    },
    duration: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false
    },
    lastSeen: {
        type: DataTypes.DATE,
        allowNull: true
    },
    willTopic: {
        type: DataTypes.STRING,
        allowNull: true
    },
    willMessage: {
        type: DataTypes.STRING,
        allowNull: true
    },
    willQoS: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    willRetain: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    }
}, {
    classMethods: {
        getAssociations: () => {
            return {
                topics: {
                    type: 'hasMany',
                    model: Topic_1.Topic,
                    as: 'topics',
                    constraints: false
                },
                subscriptions: {
                    type: 'hasMany',
                    model: Subscription_1.Subscription,
                    as: 'subscriptions',
                    constraints: false
                },
                messages: {
                    type: 'hasMany',
                    model: Message_1.Message,
                    as: 'messages',
                    constraints: false
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
        },
        beforeDestroy: function (device) {
            return Promise.all([
                Topic_1.Topic.destroy({ where: { deviceId: device.id } }),
                Subscription_1.Subscription.destroy({ where: { deviceId: device.id } }),
                Message_1.Message.destroy({ where: { deviceId: device.id } })
            ]);
        }
    }
});

//# sourceMappingURL=Device.js.map
