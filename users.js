var bcrypt = require('bcryptjs'),
    Q = require('q');

// MongoDB connection information
const MongoClient = require('mongodb').MongoClient;

var config = require('./config.js');

var mongodbUrl = config.mongodbUri;


exports.findOrCreate = function (profile, cb) {
  // var deferred = Q.defer();

  MongoClient.connect(mongodbUrl, function (err, db) {
    var collection = db.collection('users');
    var obj = {'provider': profile.provider};
    obj[profile.provider+"Id"] = profile.id; //prints {key: "value"}

    //check if username is already assigned in our database
    collection.findOne(obj)
      .then(function (result) {
        if (!result) {
            var user = {
              "provider" : profile.provider,
            //   "_id" : profile.id,
              "displayName": profile.displayName
            }
            user[profile.provider+"Id"] = profile.id;

            if(profile.photos){
                user["avatar"] = profile.photos[0].value;
            } else {
                user["avatar"] = "http://placepuppy.it/images/homepage/Beagle_puppy_6_weeks.JPG";
            }

            console.log("CREATING USER:", profile.displayName);

            collection.insert(user, function () {
                // console.log("\n\n\n\n\n\n\n\n\n\n\n\n\n"+JSON.stringify(data)+"\n\n\n\n\n\n\n\n\n\n\n\n\n");
                db.close();
                // deferred.resolve(false); // username exists
                return cb(null, user);
            });
        }
        else  {
            db.close();
            // deferred.resolve(false);
            return cb(null, result);
        }
      });
  });

  // return deferred.promise;
};
