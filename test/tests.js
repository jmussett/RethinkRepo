var rdb = require("../index.js");
var repo = rdb("Test", "localhost", 28015);
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var expect = chai.expect;
var Joi = repo.Validation;

chai.use(chaiAsPromised);

describe("Registration", function () {
    beforeEach(function(){
        repo = rdb("Test", 'localhost', 28015);
    });

    it("should error with unrecognised type", function() {
        var err = "RepositoryError: Unrecognised type, use either an object with a name and a schema, or a Model inherited class function";
        var obj = "not an object";
        expect(function() { repo.Register(obj) }).to.throw(err);
    });

    it("should error with invalid name", function() {
        var err = "RepositoryError: The object is invalid, the name of the model must be a string";
        var obj = {
            Schema: {}
        };
        expect(function() { repo.Register(obj) }).to.throw(err);
    });

    it("should error with invalid schema", function() {
        var err = "RepositoryError: The object is invalid, the schema of the model must be an object";
        var obj = {
            Name: "test"
        };
        expect(function() { repo.Register(obj) }).to.throw(err);
    });

    it("should error with non-alphabetic name", function() {
        var err = "RepositoryError: The object is invalid, the name can only contain alphabetic characters";
        var obj1 = {
            Name: "testobject1",
            Schema: {}
        };
        var obj2 = {
            Name: "test object",
            Schema: {}
        };
        var obj3 = {
            Name: "test_object",
            Schema: {}
        };
        expect(function() { repo.Register(obj1) }).to.throw(err);
        expect(function() { repo.Register(obj2) }).to.throw(err);
        expect(function() { repo.Register(obj3) }).to.throw(err);
    });

    it("should error with duplicate models", function() {
        var err = "Model 'test' has already been registered, please choose a different model name";
        var obj1 = {
            Name: "test",
            Schema: {}
        };

        var obj2 = {
            Name: "test",
            Schema: {}
        };

        repo.Register(obj1);
        expect(function() { repo.Register(obj2) }).to.throw(err);
    });

    it("should error after repository is initialised", function() {
        var err = "Models can only be registered before the Repository has been initialised";
        var obj = {
            Name: "test",
            Schema: {}
        };

        var p = repo.Init().then(function () {
            repo.Register(obj);
        });

        return expect(p).to.eventually.be.rejectedWith(err);
    });
});

describe("Initialisation", function () {
    beforeEach(function(){
        repo = rdb("Test", 'localhost', 28015);
    });

    it("should initialise model", function() {
        var obj = {
            Name: "test", 
            Schema: {
                key: Joi.primaryString()
            }
        };

        repo.Register(obj);
        return expect(repo.Init()).to.eventually.be.fulfilled;
    })

    it("should error when primary key is missing", function() {
        var err = "Primary key is not defined";
        var obj = {
            Name: "test", 
            Schema: {}
        };

        repo.Register(obj);
        return expect(repo.Init()).to.eventually.be.rejectedWith(err);
    })

    it("should error when there is more than one primary key", function() {
        var err = "Primary key already exists";
        var obj = {
            Name: "test", 
            Schema: {
                key1: Joi.primaryString(),
                key2: Joi.primaryNumber()
            }
        };

        repo.Register(obj);
        return expect(repo.Init()).to.eventually.be.rejectedWith(err);
    })

    it("should error when schema validation is not a joi object", function() {
        var err = "'key2' has no validation";
        var obj = {
            Name: "test", 
            Schema: {
                key1: Joi.primaryString(),
                key2: "not a joi object"
            }
        };
        
        repo.Register(obj);
        return expect(repo.Init()).to.eventually.be.rejectedWith(err);
    })

    it("should error when there is more than one property with the same name", function() {
        var err = "Schema cannot contain more than one property with the same name";
        var obj = {
            Name: "test", 
            Schema: {
                key: Joi.primaryString(),
                key: Joi.string()
            }
        };

        repo.Register(obj);
        return expect(repo.Init()).to.eventually.be.rejectedWith(err);
    })
});

describe("Destruction", function () {
    it("should error before repository is initialised", function() {
        var err = "The Repository can only be destroyed after the Repository has been initialised";

        var p = repo.Init().then(function() {
            return repo.Destroy();
        });

        return expect(p).to.eventually.be.rejectedWith(err);
    });

    it("should delete database", function() {
        var p = repo.Init().then(function() {
            return repo.Destroy();
        });

        return expect(p).to.eventually.be.fulfilled;
    })
});