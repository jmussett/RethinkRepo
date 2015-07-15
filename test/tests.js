var rdb = require("../index.js");
var repo = rdb("Test", 'localhost', 28015);
var chai = require("chai");
var expect = chai.expect;

function registrationTest(obj, msg) {

}

describe("Registration", function () {
    beforeEach(function(){
        repo = rdb("Test", 'localhost', 28015);
    });

    it("Should error with unrecognised type", function() {
        var msg = "Unrecogngised type, use either an object with a name and a schema, or a Model inherited class function";
        var obj = "not an object";
        repo.Register(obj);
        repo.Init().catch(function(err) {
            expect(err.message).to.equal(msg)
        });
    });

    it("Should error with invalid name", function() {
        var err = "The object is invalid, the name of the model must be a string";
        var obj = {
            schema: {}
        };
        registrationTest(obj, err);
    });

    it("Should error with invalid schema", function() {
        var err = "The object is invalid, the schema of the model must be an object";
        var obj = {
            name: "test"
        };
        registrationTest(obj, err);
    });

    it("Should error with non-alphabetic name", function() {
        var err = "The object is invalid, the name can only contain alphabetic characters";
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
        registrationTest(obj1, err);
        registrationTest(obj2, err);
        registrationTest(obj3, err);
    });

    it("Should error with object", function() {
        repo.Register({
            name: "TestObject",
            schema: {}
        })
    });

    it("Should error with duplicate models", function() {
        var err = "Model 'test' has already been registered, please choose a different model name";
        var obj = {
            name: "test",
            schema: {}
        };

        repo.Register(obj);
        registrationTest(obj, err);
    });
});

describe("Destruction", function () {
    it("", function() {

    })
});