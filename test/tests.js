var rdb = require("../index.js");
var repo = rdb("Test", 'localhost', 28015);
var chai = require("chai");
var expect = chai.expect;

describe("Registration", function () {
    beforeEach(function(){
        repo = rdb("Test", 'localhost', 28015);
    });

    it("should error with unrecognised type", function() {
        var err = "RepositoryError: Unrecognised type, use either an object with a name and a schema, or a Model inherited class function";
        var obj = "not an object";
        expect(repo.Register.bind(obj)).to.throw(err);
    });

    it("should error with invalid name", function() {
        var err = "RepositoryError: The object is invalid, the name of the model must be a string";
        var obj = {
            schema: {}
        };
        expect(repo.Register.bind(obj)).to.throw(err);
    });

    it("should error with invalid schema", function() {
        var err = "RepositoryError: The object is invalid, the schema of the model must be an object";
        var obj = {
            name: "test"
        };
        expect(repo.Register.bind(obj)).to.throw(err);
    });

    it("should error with non-alphabetic name", function() {
        var err = "RepositoryError: The object is invalid, the name can only contain alphabetic characters";
        var obj1 = {
            name: "testobject1",
            schema: {}
        };
        var obj2 = {
            name: "test object",
            schema: {}
        };
        var obj3 = {
            name: "test_object",
            schema: {}
        };
        expect(repo.Register.bind(obj1)).to.throw(err);
        expect(repo.Register.bind(obj2)).to.throw(err);
        expect(repo.Register.bind(obj3)).to.throw(err);
    });

    it("should error with object", function() {
        repo.Register({
            name: "TestObject",
            schema: {}
        })
    });

    it("should error with duplicate models", function() {
        var err = "Model 'test' has already been registered, please choose a different model name";
        var obj = {
            name: "test",
            schema: {}
        };

        repo.Register(obj);
    });
});

describe("Destruction", function () {
    it("", function() {

    })
});