// TODO:
// - PUT /room/:id.json
// - POST /rooms/:id/uploads.json
// - GET /rooms/:id/uploads.json

var base64 = require('./base64')
  , events = require('events')
  , http = require('http')
  , sys = require('sys');

function noop() {};

exports.debug = false;

exports.createLobby = function createLobby(opts) {
  return new Lobby(opts);
};


var Lobby = exports.Lobby = function Lobby(opts) {
  opts = opts || {};
  if (typeof opts.subdomain !== 'string') {
    throw new TypeError('opts.subdomain must be a string');
  } else if (typeof opts.token !== 'string') {
    throw new TypeError('opts.token must be a string');
  }
  this.cached = {rooms: {}, users: {}};
  this.host = opts.subdomain + '.campfirenow.com';
  this.client = http.createClient(80, this.host);
  this.headers = {
    'Host': this.host
  , 'Content-Type': 'application/json'
  , 'Authorization': base64.encode(opts.token + ':x')
  };
};

Lobby.prototype.request = function(method, path, callback) {
  if (exports.debug) {
    sys.print('> ', method, ' ', path, '\n');
  }
  var body;
  if (typeof callback === 'string') {
    body = callback;
    callback = arguments[3];
  }
  var request = this.client.request(method, path, this.headers);
  if (callback) {
    request.addListener('response', function(response) {
      var data = '';
      response.setEncoding('utf8');
      response.addListener('data', function(chunk) {
        data += chunk;
      });
      response.addListener('error', function(err) {
        callback(err, null, response);
      });
      response.addListener('end', function() {
        if (exports.debug) {
          sys.print('< ', data, '\n');
        }
        try {
          data = data.trim() ? JSON.parse(data) : undefined;
          callback(null, data, response);
        } catch (err) {
          callback(err, data, response);
        }
      });
    });
  }
  if (body) {
    request.write(body);
  }
  request.end();
  return request;
};

// Finds all rooms.
// >> client.rooms(function(err, rooms) { ... });
Lobby.prototype.rooms = function(callback) {
  return Room.all(this, callback);
};
  
// Finds a room by ID.
// >> client.room('1234', function(err, room) { ... });
Lobby.prototype.room = function(id, callback) {
  return Room.get(this, id, callback);
};
  
// Finds a room by name. The room callback parameter will be null if
// a matching room wasn't found.
// >> client.roomByName('Gnome Garden', function(err, room) { ... });
Lobby.prototype.roomByName = function(name, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }
  var _this = this;
  Room.all(this, function(err, rooms) {
    if (err) {
      callback(err, undefined);
      return;
    }
    for (var i = 0, len = rooms.length; i < len; ++i) {
      var room = rooms[i];
      if (room.name === name) {
        Room.get(_this, room.id, callback);
        return;
      }
    }
    callback(null, undefined);
  });
};

Lobby.prototype.user = function(id, callback) {
  return User.get(this, id, callback);
};

Lobby.prototype.me = function(callback) {
  return User.me(this, callback);
};


var Room = exports.Room = function Room(lobby, data) {
  var self = this;
  events.EventEmitter.call(self);
  self.lobby = lobby;
  self.users = {};
  self.data(data);
  if (data.users) {
    process.nextTick(function() {
      data.users.forEach(function(userData) {
        var user = new User(lobby, userData);  // FIXME: merge if exists
        self.users[user.id] = user;  // FIXME: need to remove when they leave
        self.emit('user', user);
        return user;
      });
    });
  }
};

sys.inherits(Room, events.EventEmitter);

Room.all = function(lobby, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }
  lobby.request('GET', '/rooms.json', function(err, data) {
    if (err) {
      callback(err, data);
    } else {
      var rooms = [];
      data.rooms.forEach(function(room) {
        rooms.push(new Room(lobby, room));
      });
      callback(null, rooms);
    }
  });
};

Room.get = function(lobby, id, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }
  if (lobby.cached.rooms[id]) {
    callback(null, lobby.cached.rooms[id]);
  } else {
    lobby.request('GET', '/room/' + id + '.json', function(err, data) {
      if (err) {
        callback(err, data);
      } else {
        var room = new Room(lobby, data.room);
        lobby.cached.rooms[room.id] = room;  // FIXME: merge if set
        callback(null, room);
      }
    });
  }
};

Room.prototype.data = function(data) {
  var _this = this;
  Object.keys(data).forEach(function(key) {
    if (key === 'users') {
      // FIXME: merge in users
    } else {
      _this[key] = data[key];
    }
  });
  this.emit('data', data);
};

Room.prototype.path = function(suffix) {
  var path = '/room/' + this.id;
  if (suffix) {
    path += '/' + suffix;
  }
  path += '.json';
  return path;
};

Room.prototype.refresh = function() {
  var _this = this;
  Room.get(this.id, function(err, data) {
    if (err) {
      _this.emit('error', err, data);
    } else {
      _this.data(data);
    }
  });
};

Room.prototype.listen = function() {
  var _this = this;
  var client = http.createClient(80, 'streaming.campfirenow.com');
  var request = client.request('GET', this.path('live'), {
    Host: 'streaming.campfirenow.com'
  , Authorization: this.lobby.headers.Authorization
  });
  request.addListener('response', function(response) {
    _this.emit('listening', response);
    response.setBodyEncoding('utf8');
    response.addListener('data', function(data) {
      data = data.trim();
      if (!data) {
        return;
      }
      data.split('\r').forEach(function(chunk) {
        try {
          var message = JSON.parse(chunk);
          _this.emit('message', message);
        } catch (err) {
          _this.emit('error', err);
        }
      });
    });
    response.addListener('end', function() {
      _this.emit('timeout');
    });
  });
  request.end();
  return request;
};

Room.prototype.speak = function(type, body) {
  var message = {body: body};
  switch (type.toLowerCase()) {
    case 'paste':
    case 'pastemessage':
      message.type = 'PasteMessage';
      break;
    
    case 'sound':
    case 'soundmessage':
      message.type = 'SoundMessage';
      break;

    case 'text':
    case 'textmessage':
      message.type = 'TextMessage';
      break;

    case 'tweet':
    case 'tweetmessage':
      message.type = 'TweetMessage';
      break;
    
    default:
      throw new TypeError('type must be "text", "paste", "sound", or "tweet"');
  }
  message = JSON.stringify({message: message});
  var _this = this;
  return this.lobby.request('POST', this.path('speak'), message, function(err, data) {
    if (err) {
      _this.emit('error', err, data);
    } else {
      _this.emit('spoke', data);
    }
  });
};

(function() {
  var methods = { join:   'joined'
                , leave:  'left'
                , lock:   'locked'
                , unlock: 'unlocked' };
  Object.keys(methods).forEach(function(key) {
    Room.prototype[key] = function() {
      var _this = this;
      return this.lobby.request('POST', this.path(key), function(err, data) {
        if (err) {
          _this.emit('error', err, data);
        } else {
          _this.emit(methods[key], data);
        }
      });
    };
  });  
})();


var User = exports.User = function User(lobby, data) {
  this.lobby = lobby;
  this.data(data);
};

sys.inherits(User, events.EventEmitter);

User.get = function(lobby, id, callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }
  if (lobby.cached.users[id]) {
    callback(null, lobby.cached.users[id]);
  } else {
    lobby.request('GET', '/users/' + id + '.json', function(err, data) {
      if (err) {
        callback(err, data);
      } else {
        var user = new User(lobby, data.user);
        lobby.cached.users[user.id] = user;  // FIXME: merge if set
        if (id === 'me') {
          lobby.cached.users['me'] = user;
        }
        callback(null, user);
      }
    });
  }
};

User.me = function(lobby, callback) {
  return this.get(lobby, 'me', callback);
};

User.prototype.data = function(data) {
  var _this = this;
  Object.keys(data).forEach(function(key) {
    _this[key] = data[key];
  });
  this.emit('data', data);
};

User.prototype.refresh = function() {
  var _this = this;
  User.get(this.id, function(err, data) {
    if (err) {
      _this.emit('error', err, data);
    } else {
      _this.data(data);
    }
  });
};

