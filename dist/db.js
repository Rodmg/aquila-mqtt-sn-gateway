"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Sequelize = require("sequelize");
const Logger_1 = require("./Logger");
const _ = require("lodash");
let dbOptions = {
    dialect: 'sqlite',
    storage: 'db.sqlite',
    logging: false,
    define: {
        freezeTableName: true,
        instanceMethods: {
            toJSON() {
                let object = _.clone(this.dataValues);
                delete object.createdAt;
                delete object.updatedAt;
                return object;
            }
        }
    }
};
exports.db = new Sequelize('aquila-gateway', 'gw', '', dbOptions);
function setupAssociations(model) {
    let asocs = {};
    if (model.getAssociations != null)
        asocs = model.getAssociations();
    for (let k of Object.keys(asocs)) {
        let asoc = asocs[k];
        let options = _.omit(asoc, ['type', 'model']);
        if (model[asoc.type] != null)
            model[asoc.type](asoc.model, options);
        else
            Logger_1.log.warn('Invalid association type for model:', k, asoc);
    }
}
function setupDB() {
    let models = Object.keys(exports.db.models).map((k) => exports.db.models[k]);
    for (let model of models) {
        setupAssociations(model);
    }
    return Promise.resolve(exports.db.sync());
}
exports.setupDB = setupDB;

//# sourceMappingURL=db.js.map
