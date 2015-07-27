"use strict";

module.exports = function(dbName, host, port, logger) {
    var repo = require("./lib/repo.js")(dbName, host, port, logger);
    return {
        errors: require("./lib/errors.js"),
        validation: require("./lib/validation.js"),
        register: repo.register,
        init: repo.init,
        newModel: repo.newModel,
        destroy: repo.destroy,
        query: repo.query
    };
};
