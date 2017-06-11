const express = require('express'),
    exphbs = require('express-handlebars'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    session = require('express-session'),
    passport = require('passport'),
    LocalStrategy = require('passport-local'),
    TwitterStrategy = require('passport-twitter'),
    FacebookStrategy = require('passport-facebook'),
    GoogleStrategy = require('passport-google-oauth').OAuth2Strategy,
    request = require('request'),
    app = express(),
    MongoClient = require('mongodb').MongoClient,
    yelp = require('yelp-fusion'),
    asyncx = require('async'),
    qs = require('qs');


    var config = require('./config.js');
    var funct = require('./functions.js');
    var User = require('./users.js');


    var mongodbUrl = config.mongodbUri;


function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  req.session.error = 'Please sign in!';
  res.redirect('/signin');
}


app.use(logger('combined'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(session({secret: 'supernova', saveUninitialized: true, resave: true}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('static'))


passport.use('local-signin', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localAuth(username, password)
    .then(function (user) {
      if (user) {
        console.log("LOGGED IN AS: " + user.username);
        req.session.success = 'You are successfully logged in ' + user.username + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT LOG IN");
        req.session.error = 'Could not log user in. Please try again.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));

// Use the LocalStrategy within Passport to register/"signup" users.
passport.use('local-signup', new LocalStrategy(
  {passReqToCallback : true}, //allows us to pass back the request to the callback
  function(req, username, password, done) {
    funct.localReg(req, username, password)
    .then(function (user) {
      if (user) {
        console.log("REGISTERED: " + user.displayName);
        req.session.success = 'You are successfully registered and logged in ' + user.displayName + '!';
        done(null, user);
      }
      if (!user) {
        console.log("COULD NOT REGISTER");
        req.session.error = 'That username is already in use, please try a different one.'; //inform user could not log them in
        done(null, user);
      }
    })
    .fail(function (err){
      console.log(err.body);
    });
  }
));


passport.use(new TwitterStrategy({
    consumerKey: config.TWITTER_CONSUMER_KEY,
    consumerSecret: config.TWITTER_CONSUMER_SECRET,
    callbackURL: config.url + "auth/twitter/callback"
  },
  function(token, tokenSecret, profile, cb) {
    User.findOrCreate(profile, cb);
  }
));


passport.use(new GoogleStrategy({
    clientID: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    callbackURL: config.url + "auth/google/callback"
  },
  function(accessToken, refreshToken, profile, done) {
      User.findOrCreate(profile, done);
  }
));

passport.use(new FacebookStrategy({
    clientID: config.FACEBOOK_CLIENT_ID,
    clientSecret: config.FACEBOOK_CLIENT_SECRET,
    callbackURL: config.url + "auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, done) {
      User.findOrCreate(profile, done);
  }
));


passport.serializeUser(function(user, done) {
  console.log("serializing " + user.username);
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  console.log("deserializing " + obj);
  done(null, obj);
});




app.use(function(req, res, next){
  var err = req.session.error,
      msg = req.session.notice,
      success = req.session.success;

  delete req.session.error;
  delete req.session.success;
  delete req.session.notice;

  if (err) res.locals.error = err;
  if (msg) res.locals.notice = msg;
  if (success) res.locals.success = success;

  next();
});


var hbs = exphbs.create({ defaultLayout: 'main' });
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');


app.get("/go", function(req, res) {
    MongoClient.connect(mongodbUrl, function (err, db) {
        var collection = db.collection('place-user');
        var places = db.collection('places');
        collection.findOne({"userid" : req.user._id, placeId: req.query.q}).then(function (result) {
            if(result) {
                collection.remove({"userid" : req.user._id, placeId: req.query.q}, function(err, data) {
                    places.findAndModify(
                        { _id: req.query.q},
                        [],
                        { $inc: { going: -1 } },
                        { new: true }, function(er1, data1) {
                        console.log(er1 + "\n\n\n\n\n\n\n\n\n");
                        console.log(JSON.stringify(data1) + "\n\n\n\n\n\n\n\n\n");
                        res.json({num: data1.value.going});
                    });

                });
            } else {
                    collection.insert({"userid" : req.user._id, placeId: req.query.q}, function(err, data) {
                        places.findAndModify(
                            { _id: req.query.q},
                            [],
                            { $inc: { going: 1 } },
                            { new: true, upsert: true }, function(er1, data1) {
                            console.log(er1 + "\n\n\n\n\n\n\n\n\n");
                            console.log(JSON.stringify(data1) + "\n\n\n\n\n\n\n\n\n");
                            res.json({num: data1.value.going});
                        });

                    });
            }
        });

    });
});


app.get('/', function(req, res){
    if (req.session.q){
        q = req.session.q
        delete req.session.q;
        request.get(config.url + 'yelp/search?' + qs.stringify({ q: q }), function(error, response, body) {
            var body1 = JSON.parse(body);
            res.render('home', {user: req.user, results: body1, q:q, title : 'NightLife'});
        });
    }
    else {
        res.render('home', {user: req.user, title : 'NightLife'});
    }
});



app.get('/yelp/search', function(req, res){

    yelp.accessToken(config.YELP_CLIENT_ID, config.YELP_CLIENT_SECRET).then(responseacc => {
        const client = yelp.client(responseacc.jsonBody.access_token);

        client.search({
            categories:'bars',
            location: req.query.q,
            limit : 5
        }).then(response => {
            var arr = [];
            asyncx.each(response.jsonBody.businesses, function(listItem, callback) {

                // Perform operation on file here.
                client.reviews(listItem.id).then(response => {
                    MongoClient.connect(mongodbUrl, function (err, db) {
                        var collection = db.collection('places');
                        collection.findOne({"_id" : listItem.id}).then(function (result) {
                            var go;
                            if (!result) {
                                go = 0;
                            } else {
                                go = result.going;
                            }
                            var obj = {
                                id :listItem.id,
                                name : listItem.name,
                                url : listItem.url,
                                des : response.jsonBody.reviews[0].text,
                                img : listItem.image_url,
                                numGoing : go
                            }
                            arr.push(obj);
                            callback();
                        });
                    });

                }).catch(e => {
                    console.log(e);
                });

            }, function(err) {
                // if any of the file processing produced an error, err would equal that error
                if( err ) {
                  // One of the iterations produced an error.
                  // All processing will now stop.
                  console.log('A file failed to process');
                } else {
                    res.json(arr);
                }
            });
        });

    }).catch(e => {
      console.log(e);
    });
});




app.get('/signin', function(req, res){
    req.session.q = req.query.q;
    res.render('signin', {title : 'NightLife | Sign In'});
});

app.post('/local-reg', passport.authenticate('local-signup', {
  successRedirect: '/',
  failureRedirect: '/signin'
  })
);

app.post('/login', passport.authenticate('local-signin', {
  successRedirect: '/',
  failureRedirect: '/signin'
  })
);


app.get('/auth/twitter', passport.authenticate('twitter'));


app.get('/auth/twitter/callback',
  passport.authenticate('twitter', { failureRedirect: '/signin' }),
  function(req, res) {
    res.redirect('/');
  });




app.get('/logout', function(req, res){
  var name = req.user.username;
  console.log("LOGGIN OUT " + req.user.username)
  req.logout();
  res.redirect('/');
  req.session.notice = "You have successfully been logged out " + name + "!";
});



app.get('/auth/google',
  passport.authenticate('google', { scope: ['openid profile email'] }));


app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/signin' }),
  function(req, res) {
    res.redirect('/');
  });


app.get('/auth/facebook', passport.authenticate('facebook'));

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { successRedirect: '/',
                                      failureRedirect: '/login' }));

var port = process.argv[2];
app.listen(port, function() {
  console.log('server listening on port ' + port);
  console.log(config.url);
});
