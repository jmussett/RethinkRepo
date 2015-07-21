"use strict";

var _ = require("lazy.js");
var Promise = require("bluebird");
var Joi = require("joi");
var RethinkDb = require("rethinkdbdash");

var contextEnforcer = Symbol();
var modelEnforcer = Symbol();
var baseEnforcer = Symbol();

function modelExists(registeredModels, currentModel) {
    // Check if defined model has already been registered with the repo
    return !_(registeredModels).every(function(registeredModel) {
        return currentModel.Name !== registeredModel.Name;
    });
}

function Validation() {

    var validation = Joi;

    validation.primaryString = function() {
        return Joi.string().required().meta({ isPrimary: true });
    };

    validation.primaryNumber = function() {
        return Joi.number().required().meta({ isPrimary: true });
    };

    return validation;
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

function Model(childModel, enforcer) {
    var model = {};

    if (childModel !== undefined) {
        if (enforcer !== modelEnforcer) {
            return Promise.reject(new RepositoryError("Models cannot be instanciated with a child model externally, please use Model()"));
        }
        model = childModel;
    }

    var r = null;

    model.Init = function(context, mEnforcer) {

        // Make Initialisation of model to be managed internally through the Repository.Init Method
        if (mEnforcer !== modelEnforcer) {
            return Promise.reject(new RepositoryError("Models cannot be initialised externally, please register your models using Repository.Register()"));
        }

        if (typeof model.Schema !== "function") {
            return Promise.reject(new SchemaError("Schema must be a function"));
        }

        r = context;

        return r.tableList().run().then(function(result) {
            var schema = model.Schema();
            var schemaArray = [];
            var hasPrimary = false;
            var options = {};
            var p;

            _(schema).keys().each(function(prop) {
                // If schema contains an object that is not a valid Joi object, throw an error
                if (!schema[prop].isJoi) {
                    p = Promise.reject(new SchemaError("'" + prop + "' has no validation"));
                }

                _(schema[prop]._meta).each(function(meta) {
                    // Look for primary key
                    if (meta.isPrimary) {
                        // If more than one primary key is defined in the schema, throw an error
                        if (hasPrimary) {
                            p = Promise.reject(new SchemaError("Primary key already exists"));
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
                return Promise.reject(new SchemaError("Schema cannot contain more than one property with the same name"));
            }

            // If primary key isn't defined, throw an error
            if (!hasPrimary) {
                return Promise.reject(new SchemaError("Primary key is not defined"));
            }

            // If table for current model is not defined, create a new table
            if (result.indexOf(model.Name) === -1) {
                return r.tableCreate(model.Name, options).run().then(function() {
                    console.log("Table '" + model.Name + "' created successfully.");
                });
            }

            return Promise.resolve();
        });
    };

    model.Save = function() {
        // If schema isn't defined, throw an error
        if (model.Schema === undefined) {
            return Promise.reject(new SchemaError("No schema defined for " + tableName));
        }
        else {
            var primaryKey;
            var hasPrimary = false;
            var objectToSave = {};
            var schemaToValidate = {};
            var schema = model.Schema();

            _(schema).keys().each(function (prop) {
                var validatiion = schema[prop];
                var value = model[prop];

                // If schema contains an object that is not a valid Joi object, throw an error
                if (!validatiion.isJoi) {
                    return Promise.reject(new SchemaError("'" + prop + "' has no validation"));
                }

                schemaToValidate[prop] = validatiion;
                objectToSave[prop] = value;

                _(validatiion._meta).each(function (meta) {
                    // Look for primary key
                    if (meta.isPrimary) {
                        // If the current property is undefined, throw an error
                        if (value === undefined) {
                            return Promise.reject(new ValidationError("Property '" + prop + "' is required"));
                        }

                        // If more than one primary key is defined in the schema, throw an error
                        if (hasPrimary) {
                            return Promise.reject(new SchemaError("Primary key already exists"));
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
                return Promise.reject(new SchemaError("Primary key is not defined"));
            }

            var schemaObject = Joi.object().keys(schemaToValidate);

            // Validate the object
            Joi.validate(objectToSave, schemaObject, {abortEarly: false}, function (err) {
                // If a model property fails to validate, throw an error
                if (err) {
                    return Promise.reject(new ValidationError(err));
                }
            });

            return r.table(model.Name).get(primaryKey).run().then(function (result) {
                if (result === null) {
                    // If the object does not exist, insert the the item
                    return r.table(model.Name).insert(objectToSave).run();
                } else {
                    // If the object does exist, update the existing item
                    return r.table(model.Name).get(primaryKey).update(objectToSave).run();
                }
            });
        }
    };

    return model;
}

function Query(queryContext, model) {
    var context = queryContext;
    var currentModel = model;

    return {
        Get: function(identifier) {
            // The get function should only be called after the query was first initialised using Query(Model)
            if (!this[baseEnforcer]) {
                throw new QueryError("You can only use Get() when used at the base of the query");
            }

            var schema = currentModel.Schema();

            // Todo: validate identifier
            return Query(context.get(identifier), currentModel);
        },
        Run: function() {
            // The run function should only be called after a sub-query function was first called (like Get())
            if (this[baseEnforcer]) {
                throw new QueryError("You cannot use Run() when used at the base of the query");
            }

            // Todo: return model instance by mapping and validating data
            return context.run();
        }
    };
}

function Repository(dbName, host, port) {

    var config = {
        dbName: dbName,
        host: host,
        port: port
    };

    var models = [];

    var isInitialised = false;

    // Context used to query the database (private object via symbol enforcer)
    var r = RethinkDb({
        servers: [{ host: host, port: port }],
        db: dbName
    });

    return {
        Model: Model,
        Validation: Validation(),
        ValidationError: ValidationError,
        RepositoryError: RepositoryError,
        SchemaError: SchemaError,
        QueryError: QueryError,
        Register: function(model) {
            var modelToRegister = null;
            var isObject = false;

            if(isInitialised) {
                throw new RepositoryError("Models can only be registered before the Repository has been initialised");
            }

            if(typeof model === "object") {
                if(typeof model.Schema !== "object") {
                    throw new RepositoryError("The object is invalid, the schema of the model must be an object");
                }
                isObject = true;
            }
            else if (typeof model === "function") {
                if(model.__proto__.name !== "Model") {
                    throw new RepositoryError("Class functions must inherit the repository's 'Model' class");
                }
                modelToRegister = model;
            }
            else {
                throw new RepositoryError("Unrecognised type, use either an object with a name and a schema, or a Model inherited class function");
            }

            if(typeof model.Name !== "string") {
                throw new RepositoryError("The object is invalid, the name of the model must be a string");
            }

            if(!model.Name.match(/^[a-z]+$/i)) {
                throw new RepositoryError("The object is invalid, the name can only contain alphabetic characters");
            }

            if(isObject) {
                model = Model(model, modelEnforcer);

                var schema = model.Schema;
                model.Schema = function () {
                    return schema;
                };

                modelToRegister = model;
            }

            // If the selected model is already registered, throw an error
            if (modelExists(models, modelToRegister)) {
                throw new RepositoryError("Model '" + modelToRegister.Name + "' has already been registered, please choose a different model name");
            }

            // If it isn't, add it to the list of registered models
            models.push(modelToRegister);

            console.log("Model '" + model.Name + "' registered successfully");
        },
        Init: function() {
            return r.dbList().run()
                .then(function(result) {
                    // Check if defined database exists
                    if (result.indexOf(config.dbName) === -1) {
                        // If it doesn't, create said database
                        return r.dbCreate(config.dbName).run().then(function () {
                            console.log("Db '" + config.dbName + "' created successfully.");
                        });
                    }
                    return Promise.resolve();
                })
                .then(function() {
                    console.log("Connected to RethinkDb at " + config.host + " on port " + config.port + " with db '" + config.dbName + "'");

                    // Initialise each model registered to the repo
                    return Promise.map(models, function(model) {
                        return model.Init(r, modelEnforcer);
                    });
                }).then(function() {
                    isInitialised = true;
                    return Promise.resolve();
                });
        },
        NewModel: function(model) {
            // If the selected model has not been registered, throw an error
            if (!modelExists(models, model)) {
                throw new RepositoryError("Model '" + model.Name + "' has not been registered, please register this model using Repository.Register()");
            }

            var modelToReturn = _(models).find(function (m) {
                return m.Name === model.Name;
            });

            // If the selected model has been registered, return a new instance of that model
            return new modelToReturn(r, modelEnforcer);
        },
        Query: function(model) {
            // If the selected model has not been registered, throw an error
            if (!modelExists(models, model)) {
                throw new RepositoryError("Model '" + model.Name + "' has not been registered, please register this model using Repository.Register()");
            }

            // If the selected model has been registered, return a new query object
            var query = new Query(r.table(model.Name), model);
            query[baseEnforcer] = true;
            return query;
        },
        Destroy: function () {

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
                    return Promise.resolve();
            });
        }
    };
}

module.exports = function(dbName, host, port) {
    return Repository(dbName, host, port);
};
