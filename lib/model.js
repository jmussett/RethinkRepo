"use strict";

var _ = require("lazy.js");
var bluebird = require("bluebird");
var errors = require("./errors.js");
var validation = require("./validation.js");

var SchemaError = errors.SchemaError;
var ValidationError = errors.ValidationError;

module.exports = function (childModel, context) {
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

            var schemaObject = validation.object().keys(schemaToValidate);

            // Validate the object
            validation.validate(objectToSave, schemaObject, {abortEarly: false}, function(err) {
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
};
