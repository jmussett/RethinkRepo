"use strict";

var _ = require("lazy.js");
var bluebird = require("bluebird");
var errors = require("./errors.js");
var validation = require("./validation.js");

var SchemaError = errors.SchemaError;
var ValidationError = errors.ValidationError;

module.exports = function (childModel, context, newLogger) {
    var r = context, internalModel = childModel, logger = newLogger;

    internalModel.save = function() {
        if (typeof internalModel.schema !== "object") {
            return bluebird.reject(new SchemaError("Schema for '" + internalModel.name + "' must be an object", logger));
        } else {
            var primaryKey, hasPrimary = false, objectToSave = {},
            schemaToValidate = {}, schema = internalModel.schema, p = null;

            _(schema).keys().each(function(prop) {
                var validatiion = schema[prop],
                value = internalModel[prop];

                if (!validatiion.isJoi) {
                    p = bluebird.reject(new SchemaError("'" + prop + "' has no validation", logger));
                } else {
                    schemaToValidate[prop] = validatiion;
                    objectToSave[prop] = value;

                    _(validatiion.describe().meta).each(function(meta) {
                        if (meta.isPrimary) {
                            if (hasPrimary) {
                                p = bluebird.reject(new SchemaError("Primary Key already exists", logger));
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

            if (!hasPrimary) {
                return bluebird.reject(new SchemaError("Primary Key is not defined", logger));
            }

            var schemaObject = validation.object().keys(schemaToValidate);

            validation.validate(objectToSave, schemaObject, {abortEarly: false}, function(err) {
                if (err) {
                    p = bluebird.reject(new ValidationError(err.details));
                }
            });

            if (p != null) {
                return p;
            }

            return r.table(internalModel.name).get(primaryKey).run().then(function(result) {
                if (result === null) {
                    return r.table(internalModel.name).insert(objectToSave).run();
                } else {
                    return r.table(internalModel.name).get(primaryKey).update(objectToSave).run();
                }
            });
        }
    };

    return internalModel;
};
