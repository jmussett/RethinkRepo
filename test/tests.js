"use strict";

var rdb = require("../index.js"),
chai = require("chai"),
winston = require("winston"),
chaiAsPromised = require("chai-as-promised");

var expect = chai.expect, joi, repo;

chai.use(chaiAsPromised);

function before() {
    var logger = new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({ silent: true })
        ]
    });

    repo = rdb("Test", "localhost", 28015, logger);
    joi = repo.validation;
}

describe("Registration", function() {
    beforeEach(function(){
        before();
    });

    it("should error with unrecognised type", function() {
        var err = "RepositoryError: Unrecognised type, use an object with a name and a schema";
        var obj = "not an object";
        expect(function() { repo.register("", obj); }).to.throw(err);
    });

    it("should error with invalid name", function() {
        var err = "RepositoryError: The name is invalid, the name of the model must be a string";
        var obj = {
            schema: {}
        };
        expect(function() { repo.register({}, obj); }).to.throw(err);
    });

    it("should error with invalid schema", function() {
        var err = "RepositoryError: The object is invalid, the schema of the model must be an object";
        var obj = {};
        expect(function() { repo.register("test", obj); }).to.throw(err);
    });

    it("should error with non-alphabetic name", function() {
        var err = "RepositoryError: The name is invalid, the name can only contain alphabetic characters";
        var obj = {
            schema: {}
        };

        expect(function() { repo.register("testobject1", obj); }).to.throw(err);
        expect(function() { repo.register("test object", obj); }).to.throw(err);
        expect(function() { repo.register("test_object", obj); }).to.throw(err);
        expect(function() { repo.register("", obj); }).to.throw(err);
    });

    it("should error with duplicate models", function() {
        var err = "Model 'test' has already been registered, please choose a different model name";
        var obj = {
            schema: {}
        };

        repo.register("test", obj);
        expect(function() { repo.register("test", obj); }).to.throw(err);
    });

    it("should error after repository is initialised", function() {
        var err = "Models can only be registered before the Repository has been initialised";
        var obj = {
            schema: {}
        };

        var p = repo.init().then(function() {
            repo.register("test", obj);
        });

        return expect(p).to.eventually.be.rejectedWith(err);
    });
});

describe("Initialisation", function() {
    beforeEach(function(){
        before();
    });

    it("should initiate repo without logger", function() {
        repo = rdb("Test", "localhost", 28015);
    });

    it("should initialise model", function() {
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return expect(repo.init()).to.eventually.be.fulfilled;
    });

    //required to cover all routes
    it("should initialise existing model", function() {
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return expect(repo.init()).to.eventually.be.fulfilled;
    });

    //required to cover all routes
    it("should initialise model with meta object in schema", function() {
        var obj = {
            schema: {
                key: joi.primaryString(),
                key2: joi.string().meta({ someMeta: "test" })
            }
        };

        repo.register("test", obj);
        return expect(repo.init()).to.eventually.be.fulfilled;
    });

    it("should error when primary key is missing", function() {
        var err = "Primary Key is not defined";
        var obj = {
            schema: {}
        };

        repo.register("test", obj);
        return expect(repo.init()).to.eventually.be.rejectedWith(err);
    });

    it("should error when there is more than one primary key", function() {
        var err = "Primary Key already exists";
        var obj = {
            schema: {
                key1: joi.primaryString(),
                key2: joi.primaryNumber()
            }
        };

        repo.register("test", obj);
        return expect(repo.init()).to.eventually.be.rejectedWith(err);
    });

    it("should error when schema validation is not a joi object", function() {
        var err = "'key2' has no validation";
        var obj = {
            schema: {
                key1: joi.primaryString(),
                key2: "not a joi object"
            }
        };

        repo.register("test", obj);
        return expect(repo.init()).to.eventually.be.rejectedWith(err);
    });
});

describe("Model Creation", function() {
    beforeEach(function() {
        before();
    });

    it("should create model", function() {
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        var p = repo.init().then(function() {
            var model = repo.newModel("test");
            expect(typeof model.schema).to.equal("object");
            expect(typeof model.save).to.equal("function");
        });

        return expect(p).to.eventually.be.fulfilled;
    });

    it("should error when repo is not initialised", function() {
        var err = "Models can only be created after the Repository has been initialised";
        var obj = {
            schema: {}
        };

        repo.register("test", obj);
        expect(function() { repo.newModel("test"); }).to.throw(err);
    });

    it("should error when model does not exist", function() {
        var err = "Model 'test' has not been registered, please register this model using Repository.register()";

        var p = repo.init().then(function() {
            expect(function() { repo.newModel("test"); }).to.throw(err);
        });

        return expect(p).to.eventually.be.fulfilled;
    });

    it("should error when model name is not a string", function() {
        var err = "Model name must be a string";

        var p = repo.init().then(function() {
            expect(function() { repo.newModel(5); }).to.throw(err);
            expect(function() { repo.newModel({}); }).to.throw(err);
        });

        return expect(p).to.eventually.be.fulfilled;
    });
});

describe("Saving", function() {
    beforeEach(function(){
        before();
    });

    it("should save model", function() {
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";

            var p = m.save().then(function(result) {
                expect(result.inserted).to.equal(1);
            });

            return expect(p).to.eventually.be.fulfilled;
        });
    });

    it("should save model again after update", function() {
        var obj = {
            schema: {
                key: joi.primaryString(),
                key2: joi.string()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";
            m.key2 = "test1";

            var p = m.save().then(function() {
                m.key2 = "test2";
                return m.save().then(function(result) {
                    expect(result.replaced).to.equal(1);
                });
            });

            return expect(p).to.eventually.be.fulfilled;
        });
    });

    it("should save model when schema contains meta data", function() {
        var obj = {
            schema: {
                key: joi.primaryString(),
                key2: joi.string().meta({ someMeta: "test" })
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";
            m.key2 = "test";

            return expect(m.save()).to.eventually.be.fulfilled;
        });
    });

    it("should error when schema is not an object", function() {
        var err = "Schema for 'test' must be an object";
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";
            m.schema = "not an object";
            return expect(m.save()).to.eventually.be.rejectedWith(err);
        });
    });

    it("should error when schema property has no validation", function() {
        var err = "'key' has no validation";
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";
            m.schema.key = "not validation";
            return expect(m.save()).to.eventually.be.rejectedWith(err);
        });
    });

    it("should error when schema contains more than one primary key", function() {
        var err = "Primary Key already exists";
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";
            m.schema.key2 = joi.primaryString();
            return expect(m.save()).to.eventually.be.rejectedWith(err);
        });
    });

    it("should error when schema does not contain a primary key", function() {
        var err = "Primary Key is not defined";
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";
            m.schema.key = joi.string();
            return expect(m.save()).to.eventually.be.rejectedWith(err);
        });
    });

    it("should error when primary key is not defined", function() {
        var err = "Property 'key' is required";
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            return expect(m.save()).to.eventually.be.rejectedWith(err);
        });
    });

    it("should error when schema validation fails", function() {
        var err = [{
            "message": "\"key2\" must be a number",
            "path": "key2",
            "type": "number.base",
            "context": {
                "key": "key2"
            }
        }];

        var obj = {
            schema: {
                key: joi.primaryString(),
                key2: joi.number()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";
            m.key2 = "not a number";
            return expect(m.save()).to.eventually.be.rejectedWith(err);
        });
    });
});

describe("Querying", function() {
    beforeEach(function() {
        before();
    });

    it("should get single model", function() {
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";

            var p = m.save().then(function() {
                repo.query("test").get("test").run().then(function(result) {
                    expect(result.key).to.equal("test");
                    expect(typeof result.save).to.equal("function");
                });
            }).catch(function(err) {
                console.log(err);
            });

            return expect(p).to.eventually.be.fulfilled;
        });
    });

    it("should get single object", function() {
        var obj = {
            schema: {
                key: joi.primaryString()
            }
        };

        repo.register("test", obj);
        return repo.init().then(function() {
            var m = repo.newModel("test");
            m.key = "test";

            var p = m.save().then(function() {
                repo.query("test").getObject("test").run().then(function(result) {
                    expect(result.key).to.equal("test");
                });
            });

            return expect(p).to.eventually.be.fulfilled;
        });
    });
});

describe("Destruction", function() {
    beforeEach(function(){
        before();
    });

    it("should error before repository is initialised", function() {
        var err = "The Repository can only be destroyed after the Repository has been initialised";
        return expect(repo.destroy()).to.eventually.be.rejectedWith(err);
    });

    it("should delete database", function() {
        var p = repo.init().then(function() {
            return repo.destroy();
        });

        return expect(p).to.eventually.be.fulfilled;
    });
});
