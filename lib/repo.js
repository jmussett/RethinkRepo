"use strict";
var _ = require("lazy.js");
var bluebird = require("bluebird");
var rethinkDb = require("rethinkdbdash");
var winston = require("winston");

var errors = require("./errors.js");
var model = require("./model.js");

var SchemaError = errors.SchemaError;
var RepositoryError = errors.RepositoryError;

function modelExists(registeredModels, name) {
    return !_(registeredModels).every(function(registeredModel) {
        return name !== registeredModel.name;
    });
}

module.exports = function(dbName, host, port, newLogger) {
    var isInitialised = false, models = [], logger,
    config = {
        dbName: dbName,
        host: host,
        port: port
    }, r = rethinkDb({
        servers: [{ host: host, port: port }],
        db: dbName
    });

    if (newLogger === undefined) {
        logger = new (winston.Logger)({
            transports: [
                new (winston.transports.Console)()
            ]
        });
    } else {
        logger = newLogger;
    }

    return {
        register: function (name, newModel) {
            if(isInitialised) {
                throw new RepositoryError("Models can only be registered before the Repository has been initialised", logger);
            }

            if(typeof newModel === "object") {
                if(typeof newModel.schema !== "object") {
                    throw new RepositoryError("The object is invalid, the schema of the model must be an object", logger);
                }
            }
            else {
                throw new RepositoryError("Unrecognised type, use an object with a name and a schema", logger);
            }

            if(typeof name !== "string") {
                throw new RepositoryError("The name is invalid, the name of the model must be a string", logger);
            }

            if(!name.match(/^[a-z]+$/i)) {
                throw new RepositoryError("The name is invalid, the name can only contain alphabetic characters", logger);
            }

            var modelToRegister = model(newModel, r, logger);
            modelToRegister.name = name;

            if (modelExists(models, name)) {
                throw new RepositoryError("Model '" + name + "' has already been registered, please choose a different model name", logger);
            }

            models.push(modelToRegister);

            logger.info("Model '" + name + "' registered successfully");
        },
        init: function () {
            return r.dbList().run()
                .then(function(result) {
                    if (result.indexOf(config.dbName) === -1) {
                        return r.dbCreate(config.dbName).run().then(function() {
                            logger.info("Db '" + config.dbName + "' created successfully.");
                        });
                    }
                    return bluebird.resolve();
                })
                .then(function() {
                    return bluebird.map(models, function(registeredModel) {
                        return r.tableList().run().then(function(result) {
                            var schema = registeredModel.schema, hasPrimary = false, options = {}, p;

                            _(schema).keys().each(function(prop) {
                                if (!schema[prop].isJoi) {
                                    p = bluebird.reject(new SchemaError("'" + prop + "' has no validation", logger));
                                } else {
                                    _(schema[prop].describe().meta).each(function(meta) {
                                        if (meta.isPrimary) {
                                            if (hasPrimary) {
                                                p = bluebird.reject(new SchemaError("Primary Key already exists", logger));
                                            } else {
                                                options.primaryKey = prop;
                                                hasPrimary = true;
                                            }
                                        }
                                    });
                                }
                            });

                            if (p !== undefined) {
                                return p;
                            }

                            if (!hasPrimary) {
                                return bluebird.reject(new SchemaError("Primary Key is not defined", logger));
                            }

                            if (result.indexOf(registeredModel.name) === -1) {
                                return r.tableCreate(registeredModel.name, options).run().then(function() {
                                    logger.info("Table '" + registeredModel.name + "' created successfully.");
                                });
                            }

                            return bluebird.resolve();
                        });
                    });
                }).then(function() {
                    isInitialised = true;
                    return bluebird.resolve();
                });
        },
        newModel: function (name) {
            if (typeof name !== "string") {
                throw new RepositoryError("Model name must be a string", logger);
            }

            if (!modelExists(models, name)) {
                throw new RepositoryError("Model '" + name + "' has not been registered, please register this model using Repository.register()", logger);
            }

            var modelToReturn = _(models).find(function(m) {
                return m.name === name;
            });

            return modelToReturn;
        },
        destroy: function () {
            if (!isInitialised) {
                return bluebird.reject(new RepositoryError("The Repository can only be destroyed after the Repository has been initialised", logger));
            }

            return r.dbDrop(config.dbName).run().then(function() {
                logger.info("Db '" + config.dbName + "' destroyed successfully.");
            });
        }
        // query: function(existingModel) {
        //     // If the selected model has not been registered, throw an error
        //     if (!modelExists(models, existingModel)) {
        //         throw new RepositoryError("Model '" + existingModel.Name + "' has not been registered, please register this model using Repository.Register()");
        //     }

        //     // If the selected model has been registered, return a new query object
        //     var newQuery = new Query(r.table(existingModel.Name), existingModel);
        //     newQuery[baseEnforcer] = true;
        //     return newQuery;
        // },
    };
};
