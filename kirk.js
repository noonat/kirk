var config = require('./config').kirk
  , campfire = require('./lib/campfire')
  , kirk = require('./lib/kirk')
  , irc = require('./lib/irc')
  , sys = require('sys');

irc.debug = true;

var lobbies = {};

Object.keys(config.subdomains).forEach(function(subdomain) {
  lobbies[subdomain] = campfire.createLobby({
    token: config.subdomains[subdomain].token
  , subdomain: subdomain
  });
  lobbies[subdomain].me(function(err, user) {
    if (err) throw err;
  });
});

var channels = {};
Object.keys(config.channels).forEach(function(key) {
  var channel = config.channels[key];
  var lobby = lobbies[channel.subdomain];
  if (!lobby) {
    throw new Error(
      'channel "' + key + '" subdomain "' + channel.subdomain + '" ' +
      'is not listed in config.js');
  }
  if (!(/^[#&]/).test(key)) {
    key = '#' + key;
  }
  channels[key] = {
    lobby: lobby
  , name: key
  , room: null
  , roomName: channel.name
  };
  // FIXME: need to block server startup until we know all the rooms or
  // something... there is a race condition here right now
  lobby.roomByName(channel.name, function(err, room) {
    if (err) throw err;
    channels[key].room = room;
  });
});

proxies = [];
server = irc.createServer(function(client) {
  var proxy = kirk.createProxy(client, server);
  Object.keys(channels).forEach(function(key) {
    var channel = channels[key];
    (function createChannel() {
      if (channel.room) {
        proxy.createChannel(channel.name, channel.room);
      } else {
        process.nextTick(createChannel);
      }
    })();
  });
  proxies.push(proxy);
});

server.listen(6667);
sys.puts('Listening on port 6667');

repl = require("repl");
repl.start("kirk> ");
