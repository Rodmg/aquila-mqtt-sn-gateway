"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DataTypes = require("sequelize");
const db_1 = require("./../db");
const Device_1 = require("./Device");
const Subscription_1 = require("./Subscription");
const Message_1 = require("./Message");
exports.Topic = db_1.db.define('topic', {
    id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    mqttId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    type: {
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
        beforeDestroy: function (topic) {
            return Promise.all([
                Subscription_1.Subscription.destroy({ where: { topicId: topic.id } }),
                Message_1.Message.destroy({ where: { topicId: topic.id } })
            ]);
        }
    }
});

//# sourceMappingURL=Topic.js.map
