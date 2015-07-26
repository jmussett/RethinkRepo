"use strict";

var _ = require("lazy.js");
var bluebird = require("bluebird");
var joi = require("joi");
var rethinkDb = require("rethinkdbdash");

function modelExists(registeredModels, name) {
    // Check if defined model has already been registered with the repo
    return !_(registeredModels).every(function(registeredModel) {
        return name !== registeredModel.name;
    });
}

function ExtendableError(message) {
    Error.call(this, message);
    Error.captureStackTrace(this, this.constructor);
    this.message = message;
    this.name = this.constructor.name;
}

function ValidationError(message) {
    ExtendableError.call(this, message);
}

function SchemaError(message) {
    ExtendableError.call(this, message);
}

function RepositoryError(message) {
    ExtendableError.call(this, message);
}

// function QueryError(message) {
//     ExtendableError.call(this, message);
// }

ExtendableError.prototype = Object.create(Error.prototype);
ValidationError.prototype = Object.create(ExtendableError.prototype);
SchemaError.prototype = Object.create(ExtendableError.prototype);
RepositoryError.prototype = Object.create(ExtendableError.prototype);
//QueryError.prototype = Object.create(ExtendableError.prototype);

ExtendableError.prototype.constructor = ExtendableError;
ValidationError.prototype.constructor = ValidationError;
SchemaError.prototype.constructor = SchemaError;
RepositoryError.prototype.constructor = RepositoryError;
//QueryError.prototype.constructor = QueryError;

function model(childModel, context) {
    var r = context, internalModel = childModel;

    internalModel.save = function() {
        // If schema isn't defined, throw an error
        if (typeof internalModel.schema !== "object") {
            return bluebird.reject(new SchemaError("Schema for " + internalModel.name + " must be an object"));
        }
        else {
            var primaryKey, hasPrimary = false, objectToSave = {},
            schemaToValidate = {}, schema = internalModel.schema, p = null;

            _(schema).keys().each(function(prop) {
                var validatiion = schema[prop],
                value = internalModel[prop];

                // If schema contains an object that is not a valid Joi object, throw an error
                if (!validatiion.isJoi) {
                    p = bluebird.reject(new SchemaError("'" + prop + "' has no validation"));
                } else {
                    schemaToValidate[prop] = validatiion;
                    objectToSave[prop] = value;

                    _(validatiion.describe().meta).each(function(meta) {
                        if (meta.isPrimary) {
                            if (hasPrimary) {
                                p = bluebird.reject(new SchemaError("Primary key already exists"));
                            } else if (value === undefined) {
                                p = bluebird.reject(new ValidationError("Property '" + prop + "' is required"));
                            }

                            primaryKey = value;
                            hasPrimary = true;
                        }
                    });
                }
            });

            if (p != null) {
                return p;
            }
            // If primary key isn't defined, throw an error
            if (!hasPrimary) {
                return bluebird.reject(new SchemaError("Primary key is not defined"));
            }

            var schemaObject = joi.object().keys(schemaToValidate);

            // Validate the object
            joi.validate(objectToSave, schemaObject, {abortEarly: false}, function(err) {
                // If a model property fails to validate, throw an error
                if (err) {
                    p = bluebird.reject(new ValidationError(err.details));
                }
            });

            if (p != null) {
                return p;
            }

            return r.table(internalModel.name).get(primaryKey).run().then(function(result) {
                if (result === null) {
                    // If the object does not exist, insert the the item
                    return r.table(internalModel.name).insert(objectToSave).run();
                } else {
                    // If the object does exist, update the existing item
                    return r.table(internalModel.name).get(primaryKey).update(objectToSave).run();
                }
            });
        }
    };

    return internalModel;
}

// var query = function(queryContext, existingModel) {
//     var context = queryContext, currentModel = existingModel;

//     return {
//         get: function(identifier) {
//             // The get function should only be called after the query was first initialised using Query(Model)
//             if (!this[baseEnforcer]) {
//                 throw new QueryError("You can only use Get() when used at the base of the query");
//             }

//             //var schema = currentModel.schema();

//             // Todo: validate identifier
//             return query(context.get(identifier), currentModel);
//         },
//         run: function() {
//             // The run function should only be called after a sub-query function was first called (like Get())
//             if (this[baseEnforcer]) {
//                 throw new QueryError("You cannot use Run() when used at the base of the query");
//             }

//             // Todo: return model instance by mapping and validating data
//             return context.run();
//         }
//     };
// };

var repository = function(dbName, host, port) {

    var config = {
        dbName: dbName,
        host: host,
        port: port
    }, models = [], isInitialised = false,

    // Context used to query the database (private object via symbol enforcer)
    r = rethinkDb({
        servers: [{ host: host, port: port }],
        db: dbName
    });

    return {
        errors: {
            ValidationError: ValidationError,
            RepositoryError: RepositoryError,
            //QueryError: QueryError,
            SchemaError: SchemaError
        },
        validation: (function() {

            var intenalVal = joi;

            intenalVal.primaryString = function() {
                return joi.string().required().meta({ isPrimary: true });
            };

            intenalVal.primaryNumber = function() {
                return joi.number().required().meta({ isPrimary: true });
            };

            return intenalVal;
        })(),
        register: function(name, newModel) {
            if(isInitialised) {
                throw new RepositoryError("Models can only be registered before the Repository has been initialised");
            }

            if(typeof newModel === "object") {
                if(typeof newModel.schema !== "object") {
                    throw new RepositoryError("The object is invalid, the schema of the model must be an object");
                }
            }
            else {
                throw new RepositoryError("Unrecognised type, use either an object with a name and a schema, or a Model inherited class function");
            }

            if(typeof name !== "string") {
                throw new RepositoryError("The name is invalid, the name of the model must be a string");
            }

            if(!name.match(/^[a-z]+$/i)) {
                throw new RepositoryError("The name is invalid, the name can only contain alphabetic characters");
            }

            var modelToRegister = model(newModel, r);
            modelToRegister.name = name;

            // If the selected model is already registered, throw an error
            if (modelExists(models, name)) {
                throw new RepositoryError("Model '" + name + "' has already been registered, please choose a different model name");
            }

            // If it isn't, add it to the list of registered models
            models.push(modelToRegister);

            console.log("Model '" + name + "' registered successfully");
        },
        init: function() {
            return r.dbList().run()
                .then(function(result) {
                    // Check if defined database exists
                    if (result.indexOf(config.dbName) === -1) {
                        // If it doesn't, create database
                        return r.dbCreate(config.dbName).run().then(function() {
                            console.log("Db '" + config.dbName + "' created successfully.");
                        });
                    }
                    return bluebird.resolve();
                })
                .then(function() {
                    console.log("Connected to RethinkDb at " + config.host + " on port " + config.port + " with db '" + config.dbName + "'");

                    // Initialise each model registered to the repo
                    return bluebird.map(models, function(registeredModel) {
                        return r.tableList().run().then(function(result) {
                            var schema = registeredModel.schema, hasPrimary = false, options = {}, p;

                            _(schema).keys().each(function(prop) {
                                // If schema contains an object that is not a valid Joi object, throw an error
                                if (!schema[prop].isJoi) {
                                    p = bluebird.reject(new SchemaError("'" + prop + "' has no validation"));
                                } else {
                                    _(schema[prop].describe().meta).each(function(meta) {
                                        if (meta.isPrimary) {
                                            // If more than one primary key is defined in the schema, throw an error
                                            if (hasPrimary) {
                                                p = bluebird.reject(new SchemaError("Primary key already exists"));
                                            } else {
                                                // Declare as primary and add to options for table creation
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

                            // If primary key isn't defined, throw an error
                            if (!hasPrimary) {
                                return bluebird.reject(new SchemaError("Primary key is not defined"));
                            }

                            // If table for current model is not defined, create a new table
                            if (result.indexOf(registeredModel.name) === -1) {
                                return r.tableCreate(registeredModel.name, options).run().then(function() {
                                    console.log("Table '" + registeredModel.name + "' created successfully.");
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
        newModel: function(name) {
            if (typeof name !== "string") {
                throw new RepositoryError("Model name must be a string");
            }

            // If the selected model has not been registered, throw an error
            if (!modelExists(models, name)) {
                throw new RepositoryError("Model '" + name + "' has not been registered, please register this model using Repository.register()");
            }

            var modelToReturn = _(models).find(function(m) {
                return m.name === name;
            });

            return modelToReturn;
        },
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
        destroy: function() {

            if (!isInitialised) {
                return bluebird.reject(new RepositoryError("The Repository can only be destroyed after the Repository has been initialised"));
            }

            // Database should always exist at this instance
            // If it doesn't for an unexoected reason, let the error returned by rethinkdb bubble up
            return r.dbDrop(config.dbName).run().then(function() {
                console.log("Db '" + config.dbName + "' destroyed successfully.");
            });
        }
    };
};

module.exports = function(dbName, host, port) {
    return repository(dbName, host, port);
};
