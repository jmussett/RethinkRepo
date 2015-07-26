"use strict";

var joi = require("joi");

function validation() {
    var intenalVal = joi;

    intenalVal.primaryString = function() {
        return joi.string().required().meta({ isPrimary: true });
    };

    intenalVal.primaryNumber = function() {
        return joi.number().required().meta({ isPrimary: true });
    };

    return intenalVal;
}

module.exports = validation();
