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