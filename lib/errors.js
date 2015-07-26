"use strict";

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

module.exports = {
	ValidationError: ValidationError,
	SchemaError: SchemaError,
	RepositoryError: RepositoryError,
	QueryError: QueryError
};
