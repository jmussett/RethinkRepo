"use strict";

var joi = require("joi");

var validation = function() {
    var intenalVal = joi;

    intenalVal.primaryString = function() {
        return joi.string().required().meta({ isPrimary: true });
    };

    intenalVal.primaryNumber = function() {
        return joi.number().required().meta({ isPrimary: true });
    };

    return intenalVal;
};

module.exports = validation();
