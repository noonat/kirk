var events = require('events')
  , sys = require('sys')
  , irc = require('./irc');


exports.createProxy = function(client, server) {
  return new Proxy(client, server);
};


function Proxy(client, server) {
  var self = this;
  events.EventEmitter.call(self);
  self.channels = {};
  self.server = server;
  self.client = client;
  self.client.addListener('registered', function() {
    client.write(server.host, '001', [client.nick, ':KAAAHHHHHNNNNNNN!']);
  });
  self.client.addListener('message', function(prefix, command, args) {
    self.parseMessage(prefix, command, args);
  });
};
sys.inherits(Proxy, events.EventEmitter);
exports.Proxy = Proxy;

Proxy.prototype.createChannel = function(name, room) {
  return this.channels[name] = new Channel(this, name, room);
};

Proxy.prototype.parseMessage = function(prefix, command, args) {
  switch (command) {
    case 'nick':
      if (!args[0]) {
        this.reply(irc.ERR_NONICKNAMEGIVEN);
      } else {
        this.client.nick = args[0];
      }
      break;
    
    case 'user':
      if (this.client.registered) {
        this.reply(irc.ERR_ALREADYREGISTRED);
      } else if (args.length < 4) {
        this.reply(irc.ERR_NEEDMOREPARAMS, {command: 'USER'});
      } else {
        this.client.names = {
          user: args[0]
        , host: args[1]
        , server: args[2]
        , realname: args[3]
        };
      }
      break;
    
    case 'ping':
      this.write('', 'PONG', [':' + args[0]]);
      break;
    
    case 'privmsg':
      if (!args[0]) {
        this.reply(irc.ERR_NORECIPIENT, {command: 'PRIVMSG'});
        this.reply(irc.RPL_INFO, {info: 'You must specify a channel name'});
        break;
      }
      var channel = this.channels[args[0]];
      if (!channel || !channel.joined) {
        this.reply(irc.ERR_CANNOTSENDTOCHAN, {channel: channel.name});
        this.reply(irc.RPL_INFO, {info: 'You must join the room first'});
        break;
      }
      channel.privmsg(args[1]);
      break;
    
    case 'topic':
      if (!args[0]) {
        this.reply(irc.ERR_NEEDMOREPARAMS, {command: 'TOPIC'});
        this.reply(irc.RPL_INFO, {info: 'You must specify a channel name'});
        break;
      }
      var channel = this.channels[args[0]];
      if (!channel || !channel.joined) {
        this.reply(irc.ERR_NOTONCHANNEL, {nick: args[0]});
        this.reply(irc.RPL_INFO, {info: 'You must join the room first'});
        break;
      }
      channel.topic(args[1]);
      break;
      
    case 'join':
      if (!args[0]) {
        this.client.reply(irc.ERR_NEEDMOREPARAMS, {command: 'JOIN'});
        this.client.reply(irc.RPL_INFO, {
          info: 'You must specify a channel name'
        });
      }
      var channel = this.channels[args[0]];
      if (!channel) {
        this.client.reply(irc.ERR_NOSUCHCHANNEL, {channel: args[0]});
        this.client.reply(irc.RPL_INFO, {
          info: 'Channels must be listed in config.js to be joinable'
        });
        break;
      }
      channel.join();
      break;
  }
};

Proxy.prototype.reply = function() {
  return this.client.reply.apply(this.client, arguments);
};

Proxy.prototype.write = function() {
  return this.client.write.apply(this.client, arguments);
};


function Channel(proxy, name, room) {
  var self = this;
  events.EventEmitter.call(self);
  self.name = name;
  self.joined = false;
  self.proxy = proxy;
  self.room = room;
  self.users = {};
  self.attachToRoom();
  room.lobby.me(function(err, user) {
    self.me = user;
  });
}
sys.inherits(Channel, events.EventEmitter);
exports.Channel = Channel;

Channel.prototype.attachToRoom = function() {
  var self = this;
  
  // add all the users who are already in the room
  Object.keys(self.room.users).forEach(function(id) {
    self.users[id] = new User(self.room.users[id]);
  });

  // send join events for anyone new that joins
  self.room.addListener('join', function(user) {
    self.users[user.id] = new User(user);
    self.emit('join', user);
    if (self.joined) {
      self.proxy.write(user.nick, 'JOIN', [self.name]);
    }
  });

  // send part events whenever a user leaves the room
  self.room.addListener('leave', function(user) {
    user = self.users[user.id];  // we want our class, not campfire's
    delete self.users[user.id];
    self.emit('part', user);
    if (self.joined) {
      self.proxy.write(user.nick, 'PART', [self.name, ':quitting']);
    }
  });

  // join campfire and start listening whenever the user joins
  self.addListener('joined', function() {
    self.room.join();
    self.room.addListener('joined', function() {
      self.room.listen();
    });
    self.room.addListener('timeout', function() {
      self.room.listen();  // restart the streamer if it times out
    });
    self.room.addListener('message', function(message) {
      var user_id = message.user_id;
      if (user_id === self.me.id) {
        if (message.type === 'KickMessage') {
          self.room.join();
        }
        return;  // ignore messages from ourselves
      }
      if (user_id) {
        var user = self.users[user_id];
        if (!user) {
          // we don't know about this user yet, so wait until we do
          // FIXME: this can cause messages to get out of sync
          self.room.lobby.user(user_id, function(err, user) {
            if (err) throw err;
            self.users[user.id] = user;
            self.parseCampfire(user, message);
          });
          return;
        }
      }
      self.parseCampfire(user, message);
    });
  });

  // leave the campfire room when the user leaves the irc room
  self.addListener('parted', function() {
    self.room.leave();
 });
};

Channel.prototype.join = function() {
  if (!this.joined) {
    this.joined = true;
    this.writeTopic();
    this.writeNames();
    this.proxy.write(this.proxy.client.hostmask, 'JOIN', [':' + this.name]);
    this.emit('joined');
  }
};

Channel.prototype.part = function() {
  if (this.joined) {
    this.joined = false;
    this.emit('parted');
  }
};

Channel.prototype.parseCampfire = function(user, message) {
  switch (message.type) {
    case 'TextMessage':
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':' + message.body]);
      break;
    
    case 'PasteMessage':
      var url = 'http://' + this.room.lobby.subdomain + '.campfirenow.com/room/' + this.room.id + '/paste/' + message.id;
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':' + url]);
      break;
    
    case 'SoundMessage':
      var action;
      switch (message.body) {
        case 'crickets':
          action = 'hears crickets chirping';
          break;
        case 'trombone':
          action = 'plays a sad trombone';
          break;
        case 'rimshot':
          action = 'plays a rimshot';
          break;
        default:
          action = 'plays a ' + message.body + ' sound';
          break;
      }
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':\u0001ACTION ' + action + '\u0001']);
      break;
    
    case 'TopicChangeMessage':
      this.room.topic = message.body;
      this.proxy.write(user.nick, 'TOPIC', [this.name, ':' + this.room.topic]);
      break;
    
    case 'EnterMessage':
      this.proxy.write(user.nick, 'JOIN', [this.name]);
      break;

    case 'KickMessage':
    case 'LeaveMessage':
      this.proxy.write(user.nick, 'PART', [this.name]);
      break;

    case 'AllowGuestsMessage':
      var action = 'turned on guest access';
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':\u0001ACTION ' + action + '\u0001']);
      break;
    
    case 'DisallowGuestsMessage':
      var action = 'turned off guest access';
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':\u0001ACTION ' + action + '\u0001']);
      break;
    
    case 'LockMessage':
      var action = 'locked the room';
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':\u0001ACTION ' + action + '\u0001']);
      break;
    
    case 'UnlockMessage':  // 37s isn't streaming this event yet
      var action = 'unlocked the room';
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':\u0001ACTION ' + action + '\u0001']);
      break;
      
    case 'IdleMessage':    // 37s isn't streaming this event yet
      var action = 'has gone away';
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':\u0001ACTION ' + action + '\u0001']);
      break;
    
    case 'UnidleMessage':  // 37s isn't streaming this event yet
      var action = 'is back';
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':\u0001ACTION ' + action + '\u0001']);
      break;
    
    case 'TweetMessage':
      // FIXME:
      // { room_id: 294528
      // , created_at: '2010-04-23 02:07:49'
      // , body: '--- \n:message: "To see how future distributed (fab) development will happen, check out how homebrew does it: http://bit.ly/9Fj6Ya (with hat tip to @defunkt)"\n:author_username: fabjs\n:author_avatar_url: http://a1.twimg.com/profile_images/843057520/logo_normal.png\n:id: 12656968279\n'
      // , id: 214159687
      // , user_id: 492242
      // , type: 'TweetMessage'
      // }
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':<-- this guy just pasted a tweet, but kirk no grok tweets yet']);
      break;
    
    case 'UploadMessage':
      // FIXME: need to get list of recent uploads and infer
      // var url = 'http://' + room.lobby.subdomain + '.campfirenow.com/room/' + room.id + '/uploads/' + message.id;
      // { room_id: 294528
      // , created_at: '2010-04-23 02:04:15'
      // , body: '781051240167438.jpg'
      // , id: 214158999
      // , user_id: 492242
      // , type: 'UploadMessage'
      // }
      // http://dutchmafia.campfirenow.com/room/294528/uploads/1211518/781051240167438.jpg
      this.proxy.write(user.nick, 'PRIVMSG', [this.name, ':<-- this guy just uploaded a file, but kirk no grok uploads yet']);
      break;
  }
};

Channel.prototype.privmsg = function(body) {
  var matches = /^\u0001ACTION (.+)\u0001$/.exec(body);
  if (matches) {
    this.room.speak('TextMessage', '*' + matches[1] + '*');
  } else {
    this.room.speak('TextMessage', body);
  }
};

Channel.prototype.topic = function(newTopic) {
  this.room.topic = newTopic;
  var data = JSON.stringify({room: {topic: newTopic}});
  this.room.lobby.request('PUT', this.room.url(), data);
  this.writeTopic();
};

Channel.prototype.writeNames = function() {
  var self = this;
  var nicks = [];
  Object.keys(this.users).map(function(id) {
    if (id != self.me.id) {
      nicks.push('@' + self.users[id].nick);
    }
  });
  nicks = nicks.join(' ');
  this.proxy.reply(irc.RPL_NAMREPLY, {channel: this.name, nicks: nicks});
  this.proxy.reply(irc.RPL_ENDOFNAMES, {channel: this.name});
};

Channel.prototype.writeTopic = function() {
  var topic = this.room.topic;
  if (topic) {
    this.proxy.reply(irc.RPL_TOPIC, {channel: this.name, topic: topic});
  } else {
    this.proxy.reply(irc.RPL_NOTOPIC, {channel: this.name});
  }
};


function User(campfireUser) {
  events.EventEmitter.call(this);
  this.campfireUser = campfireUser;  // FIXME: listen for changes to data
  this.id = campfireUser.id;
  this.nick = this.campfireUser.name.toLowerCase().split(' ');
  this.nick = this.nick[0] + (this.nick[1] ? this.nick[1].charAt(0) : '');
  this.names = {
    user: this.nick
  , host: 'localhost'
  , server: 'localhost'
  , realname: this.campfireUser.name
  };
  this.hostmask = this.nick + '!~' + this.names.user + '@' + this.names.host;
}
sys.inherits(User, events.EventEmitter);
exports.User = User;
