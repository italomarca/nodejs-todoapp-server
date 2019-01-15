// set up ======================================================================
var express = require('express');
var app = express(); // create our app w/ express
var mongoose = require('mongoose'); // mongoose for mongodb
var morgan = require('morgan'); // log requests to the console (express4)
var bodyParser = require('body-parser'); // pull information from HTML POST (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)

var jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
var fs = require('fs');

// configuration ===============================================================
const RSA_PRIVATE_KEY = fs.readFileSync('./demos/private.key');

app.use(express.static('./public')); // set the static files location /public/img will be /img for users
app.use(morgan('dev')); // log every request to the console
app.use(methodOverride());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ 'extended': 'true' })); // parse application/x-www-form-urlencoded
app.use(bodyParser.json({ type: 'application/vnd.api+json' })); // parse application/vnd.api+json as json

mongoose.connect('mongodb://localhost/TodosDB', (err) => {
  if (err) {
    console.log('error connecting to db', err);
  }
}); // connect to mongoDB database

// models ======================================================================
var Schema = mongoose.Schema;

var TodoSchema = Schema({
  text: String
});

var TodosSchema = Schema({
  username: String,
  password: String,
  todos: [{ type: TodoSchema, default: () => ({}) }]
});

var Todos = mongoose.model('Todos', TodosSchema);

// helpers =====================================================================
async function validateReq (req, key) {
  try {
    let token = req.headers['x-access-token'];

    if (!token) {
      return {
        err: { status: 400, auth: false, message: 'No token provided.' },
        decoded: null
      };
    };

    let decoded = await jwt.verify(token, key);

    return decoded;
  } catch (e) {
    throw new Error(401, e);
  };
}

// =============================================================================
// routes ======================================================================
app.route('/api/todos')
  .get((req, res) => {
    validateReq(req, RSA_PRIVATE_KEY)
      .then((decoded) => {
        if (!decoded.id) {
          return res.status(401).send('Token expired!').end();
        };

        // use mongoose to get all todos in the database
        Todos.findById(decoded.id, { password: 0 }, (err, data) => {
          // if there is an error retrieving, send the error. nothing after res.send(err) will execute
          if (err) {
            res.status(400).send(err).end();
            return;
          };
          res.status(200).json(data); // return all todos in JSON format
        });
      })
      .catch(e => res.status(400).send(e).end());
  })
  .post((req, res) => {
    validateReq(req, RSA_PRIVATE_KEY)
      .then((decoded) => {
        // create a todo, information comes from AJAX request from Angular
        Todos.findByIdAndUpdate(
          decoded.id,
          { $push: { todos: { text: req.body.text } } },
          (err, updated) => {
            if (err) {
              return res.status(400).send(err).end();
            }
            Todos.findById(decoded.id, (err, data) => {
              // if there is an error retrieving, send the error. nothing after res.send(err) will execute
              if (err) {
                return res.send(err);
              };
              return res.json(data); // return all todos in JSON format
            });
          }
        );
      })
      .catch(e => res.status(400).send(e).end());
  });

app.route('/api/todos/:todoId')
  .put((req, res) => {
    const { todoId } = req.params;

    validateReq(req, RSA_PRIVATE_KEY)
      .then((decoded) => {
        if (!decoded) {
          return res.status(401).send('Token expired!').end();
        };
        const queryConditions = {
          _id: decoded.id,
          todos: { $elemMatch: { _id: todoId } }
        };

        const queryParams = {
          'todos.$.text': req.body.text
        };

        Todos.findOneAndUpdate(queryConditions, queryParams, { new: true }, (err, data) => {
          if (err) {
            res.send(err).end();
          };
          res.json(data);
        });
      })
      .catch(e => res.status(400).send(e).end());
  })
  .delete((req, res) => {
    const { todoId } = req.params;

    validateReq(req, RSA_PRIVATE_KEY)
      .then((decoded) => {
        if (!decoded) {
          return res.status(401).send('Token expired!').end();
        };

        const queryConditions = {
          _id: decoded.id
        };

        const queryParams = {
          $pull: { 'todos': { '_id': todoId } }
        };

        Todos.findOneAndUpdate(queryConditions, queryParams, { new: true }, (err, data) => {
          if (err) {
            res.send(err).end();
          };
          res.json(data);
        });
      })
      .catch(e => res.status(400).send(e).end());
  });

app.route('/login')
  .post((req, res) => {
    const { username, password } = req.body;

    if (username && password) {
      Todos.findOne({ username, password }, (err, user) => {
        console.log('Login attempt:', { user: { username, password } });

        if (err || !user) {
          res.status(401).end(); // Unauthorized
          return;
        };

        var token = jwt.sign({ id: user._id }, RSA_PRIVATE_KEY, {
          expiresIn: 10
        });

        res.status(200).send({
          auth: true,
          token: token
        }).end();
      });
    } else {
      res.status(400).end(); // Bad request
    }
  });

app.route('/register')
  .post((req, res) => {
    if ((!req.body.username) || (!req.body.password)) {
      res.status(400).end();
      return;
    }

    var newUser = {
      username: req.body.username,
      password: req.body.password
    };

    Todos.findOne(newUser, (err, user) => {
      // If an error occurs within the request
      if (err) {
        res.status(400).end();
      }

      // If the user already exists
      if (user) {
        res.status(409).end();
      } else {
        // If user does NOT exist
        Todos.create(newUser, (err, user) => {
          if (err) {
            res.stauts(400).end();
          }

          var token = jwt.sign({ id: user._id }, RSA_PRIVATE_KEY, {
            expiresIn: 1
          });

          res.status(200).send({
            auth: true,
            token: token
          }).end();
        });
      }
    });
  });

app.get('*', (req, res) => {
  res.sendfile('./public/index.html'); // load the single view file (angular will handle the page changes on the front-end)
});

// listen (start app with node server.js) ======================================
app.listen(8080, () => {
  console.log('App listening on port 8080');
});
