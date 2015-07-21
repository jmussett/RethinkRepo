"use strict";

var _ = require("lazy.js");
var bluebird = require("bluebird");
var joi = require("joi");
var rethinkDb = require("rethinkdbdash");

var modelEnforcer = Symbol();
var baseEnforcer = Symbol();

function modelExists(registeredModels, currentModel) {
    // Check if defined model has already been registered with the repo
    return !_(registeredModels).every(function(registeredModel) {
        return currentModel.Name !== registeredModel.Name;
    });
}

function validation() {

    var intenals = joi;

    intenals.primaryString = function() {
        return joi.string().required().meta({ isPrimary: true });
    };

    intenals.primaryNumber = function() {
        return joi.number().required().meta({ isPrimary: true });
    };

    return intenals;
}

function ExtendableError(message) {
    Error.call(this, message);
    Error.captureStackTrace(this, this.constructor);
    this.message = message;
    this.name = this.constructor.name;
}

function ValidationError(err) {
    ExtendableError.call(this, err);
    this.message = err.message;
}

function SchemaError(message) {
    ExtendableError.call(this, message);
}

function RepositoryError(message) {
    ExtendableError.call(this, message);
}

function QueryError(message) {
    ExtendableError.call(this, message);
}

ExtendableError.prototype = Object.create(Error.prototype);
ValidationError.prototype = Object.create(ExtendableError.prototype);
SchemaError.prototype = Object.create(ExtendableError.prototype);
RepositoryError.prototype = Object.create(ExtendableError.prototype);
QueryError.prototype = Object.create(ExtendableError.prototype);

ExtendableError.prototype.constructor = ExtendableError;
ValidationError.prototype.constructor = ValidationError;
SchemaError.prototype.constructor = SchemaError;
RepositoryError.prototype.constructor = RepositoryError;
QueryError.prototype.constructor = QueryError;

function model(childModel, enforcer) {
    var internals = {};

    if (childModel !== undefined) {
        if (enforcer !== modelEnforcer) {
            return bluebird.reject(new RepositoryError("Models cannot be instanciated with a child model externally, please use Model()"));
        }
        internals = childModel;
    }

    var r = null;

    internals.init = function(context, mEnforcer) {

        // Make Initialisation of model to be managed internally through the Repository.Init Method
        if (mEnforcer !== modelEnforcer) {
            return bluebird.reject(new RepositoryError("Models cannot be initialised externally, please register your models using Repository.Register()"));
        }

        if (typeof internals.Schema !== "function") {
            return bluebird.reject(new SchemaError("Schema must be a function"));
        }

        r = context;

        return r.tableList().run().then(function(result) {
            var schema = internals.schema();
            var schemaArray = [];
            var hasPrimary = false;
            var options = {};
            var p;

            _(schema).keys().each(function(prop) {
                // If schema contains an object that is not a valid Joi object, throw an error
                if (!schema[prop].isJoi) {
                    p = bluebird.reject(new SchemaError("'" + prop + "' has no validation"));
                }

                _(schema[prop]._meta).each(function(meta) {
                    // Look for primary key
                    if (meta.isPrimary) {
                        // If more than one primary key is defined in the schema, throw an error
                        if (hasPrimary) {
                            p = bluebird.reject(new SchemaError("Primary key already exists"));
                        }

                        // Add primary key to options that are to be used when creating new table
                        options.primaryKey = prop;
                        hasPrimary = true;
                    }
                });

                schemaArray.push(prop);
            });

            if (p !== undefined) {
                return p;
            }

            if (_(schemaArray).uniq().toArray().length !== schemaArray.length) {
                return bluebird.reject(new SchemaError("Schema cannot contain more than one property with the same name"));
            }

            // If primary key isn't defined, throw an error
            if (!hasPrimary) {
                return bluebird.reject(new SchemaError("Primary key is not defined"));
            }

            // If table for current model is not defined, create a new table
            if (result.indexOf(internals.Name) === -1) {
                return r.tableCreate(internals.Name, options).run().then(function() {
                    console.log("Table '" + internals.Name + "' created successfully.");
                });
            }

            return bluebird.resolve();
        });
    };

    internals.save = function() {
        // If schema isn't defined, throw an error
        if (internals.Schema === undefined) {
            return bluebird.reject(new SchemaError("No schema defined for " + tableName));
        }
        else {
            var primaryKey;
            var hasPrimary = false;
            var objectToSave = {};
            var schemaToValidate = {};
            var schema = internals.schema();

            _(schema).keys().each(function (prop) {
                var validatiion = schema[prop];
                var value = internals[prop];

                // If schema contains an object that is not a valid Joi object, throw an error
                if (!validatiion.isJoi) {
                    return bluebird.reject(new SchemaError("'" + prop + "' has no validation"));
                }

                schemaToValidate[prop] = validatiion;
                objectToSave[prop] = value;

                _(validatiion._meta).each(function (meta) {
                    // Look for primary key
                    if (meta.isPrimary) {
                        // If the current property is undefined, throw an error
                        if (value === undefined) {
                            return bluebird.reject(new ValidationError("Property '" + prop + "' is required"));
                        }

                        // If more than one primary key is defined in the schema, throw an error
                        if (hasPrimary) {
                            return bluebird.reject(new SchemaError("Primary key already exists"));
                        }

                        // Set the primary key to be the current property
                        primaryKey = value;
                        hasPrimary = true;
                        return false;
                    }
                });
            });

            // If primary key isn't defined, throw an error
            if (!hasPrimary) {
                return bluebird.reject(new SchemaError("Primary key is not defined"));
            }

            var schemaObject = joi.object().keys(schemaToValidate);

            // Validate the object
            joi.validate(objectToSave, schemaObject, {abortEarly: false}, function (err) {
                // If a model property fails to validate, throw an error
                if (err) {
                    return bluebird.reject(new ValidationError(err));
                }
            });

            return r.table(internals.Name).get(primaryKey).run().then(function (result) {
                if (result === null) {
                    // If the object does not exist, insert the the item
                    return r.table(internals.Name).insert(objectToSave).run();
                } else {
                    // If the object does exist, update the existing item
                    return r.table(internals.Name).get(primaryKey).update(objectToSave).run();
                }
            });
        }
    };

    return internals;
}

var query = function (queryContext, existingModel) {
    var context = queryContext;
    var currentModel = existingModel;

    return {
        get: function(identifier) {
            // The get function should only be called after the query was first initialised using Query(Model)
            if (!this[baseEnforcer]) {
                throw new QueryError("You can only use Get() when used at the base of the query");
            }

            //var schema = currentModel.schema();

            // Todo: validate identifier
            return query(context.get(identifier), currentModel);
        },
        run: function() {
            // The run function should only be called after a sub-query function was first called (like Get())
            if (this[baseEnforcer]) {
                throw new QueryError("You cannot use Run() when used at the base of the query");
            }

            // Todo: return model instance by mapping and validating data
            return context.run();
        }
    };
};

var repository = function (dbName, host, port) {

    var config = {
        dbName: dbName,
        host: host,
        port: port
    };

    var models = [];

    var isInitialised = false;

    // Context used to query the database (private object via symbol enforcer)
    var r = rethinkDb({
        servers: [{ host: host, port: port }],
        db: dbName
    });

    return {
        Model: model,
        Validation: validation(),
        ValidationError: ValidationError,
        RepositoryError: RepositoryError,
        SchemaError: SchemaError,
        QueryError: QueryError,
        register: function(newModel) {
            var modelToRegister = null;
            var isObject = false;

            if(isInitialised) {
                throw new RepositoryError("Models can only be registered before the Repository has been initialised");
            }

            if(typeof newModel === "object") {
                if(typeof newModel.Schema !== "object") {
                    throw new RepositoryError("The object is invalid, the schema of the model must be an object");
                }
                isObject = true;
            }
            else if (typeof newModel === "function") {
                if(newModel.__proto__.name !== "Model") {
                    throw new RepositoryError("Class functions must inherit the repository's 'Model' class");
                }
                modelToRegister = newModel;
            }
            else {
                throw new RepositoryError("Unrecognised type, use either an object with a name and a schema, or a Model inherited class function");
            }

            if(typeof newModel.Name !== "string") {
                throw new RepositoryError("The object is invalid, the name of the model must be a string");
            }

            if(!newModel.Name.match(/^[a-z]+$/i)) {
                throw new RepositoryError("The object is invalid, the name can only contain alphabetic characters");
            }

            if(isObject) {
                modelToRegister = model(newModel, modelEnforcer);

                var schema = modelToRegister.Schema;
                modelToRegister.schema = function () {
                    return schema;
                };
            }

            // If the selected model is already registered, throw an error
            if (modelExists(models, modelToRegister)) {
                throw new RepositoryError("Model '" + modelToRegister.Name + "' has already been registered, please choose a different model name");
            }

            // If it isn't, add it to the list of registered models
            models.push(modelToRegister);

            console.log("Model '" + model.Name + "' registered successfully");
        },
        init: function() {
            return r.dbList().run()
                .then(function(result) {
                    // Check if defined database exists
                    if (result.indexOf(config.dbName) === -1) {
                        // If it doesn't, create said database
                        return r.dbCreate(config.dbName).run().then(function () {
                            console.log("Db '" + config.dbName + "' created successfully.");
                        });
                    }
                    return bluebird.resolve();
                })
                .then(function() {
                    console.log("Connected to RethinkDb at " + config.host + " on port " + config.port + " with db '" + config.dbName + "'");

                    // Initialise each model registered to the repo
                    return bluebird.map(models, function(registeredModel) {
                        return registeredModel.init(r, modelEnforcer);
                    });
                }).then(function() {
                    isInitialised = true;
                    return bluebird.resolve();
                });
        },
        newModel: function(existingModel) {
            // If the selected model has not been registered, throw an error
            if (!modelExists(models, existingModel)) {
                throw new RepositoryError("Model '" + existingModel.Name + "' has not been registered, please register this model using Repository.Register()");
            }

            var ModelToReturn = _(models).find(function (m) {
                return m.Name === existingModel.Name;
            });

            // If the selected model has been registered, return a new instance of that model
            return new ModelToReturn(r, modelEnforcer);
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
        destroy: function () {

            if (!isInitialised) {
                throw new RepositoryError("The Repository can only be destroyed after the Repository has been initialised");
            }

            return r.dbList().run().then(function(result) {
                    // Check if defined database exists
                    if(result.indexOf(config.dbName) !== -1) {
                        // If it does, delete current database
                        return r.dbDrop(config.dbName).run().then(function () {
                            console.log("Db '" + config.dbName + "' destroyed successfully.");
                        });
                    }

                    // Never expected to hit, implemented to prevent it from throwing an error in the case where the database has been deleted
                    return bluebird.resolve();
            });
        }
    };
};

module.exports = function(dbName, host, port) {
    return repository(dbName, host, port);
};
