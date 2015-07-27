"use strict";

var errors = require("./errors.js");
var QueryError = errors.QueryError;

var query = function(queryContext, existingModel, initialised) {
    var context = queryContext, currentModel = existingModel,
    isInitialised = (typeof initialised === "undefined") ? false : initialised;

    return {
        get: function(identifier) {
            // The get function should only be called after the query was first initialised using Query(Model)
            if (!isInitialised) {
                throw new QueryError("You can only use get() when used at the base of the query");
            }

            return query(context.get(identifier), currentModel);
        },
        run: function() {
            // The run function should only be called after a sub-query function was first called (like Get())
            if (isInitialised) {
                throw new QueryError("You cannot use run() when used at the base of the query");
            }

            return context.run();
        }
    };
};
