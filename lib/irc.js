var campfire = require('./campfire')
  , events = require('events')
  , net = require('net')
  , sys = require('sys');


exports.VERSION = '0.0.1';
exports.debug = false;

function debug() {
  if (exports.debug) {
    var args = Array.prototype.slice.call(arguments, 0);
    sys.debug(args.map(function(arg) {
      return String(arg);
    }).join(''));
  }
}

function error(err) {
  debug('ERROR:', (err.stack ? err.stack : err.toString()), '\n');
}

// Templates taken from Underscore
// http://github.com/documentcloud/underscore/blob/master/underscore.js

function escapeRegExp(s) {
  return s.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
};

var templateSettings = {
  start       : '{{',
  end         : '}}',
  interpolate : /\{\{(.+?)\}\}/g
};

function template(str, data) {
  var c  = templateSettings;
  var endMatch = new RegExp(
    "'(?=[^" + c.end.substr(0, 1) + "]*" + escapeRegExp(c.end) + ")", "g");
  var code = (
      'var p=[],print=function(){p.push.apply(p,arguments);};' +
      'with(obj){p.push(\'' +
      str.replace(/[\r\t\n]/g, " ")
         .replace(endMatch,"\t")
         .split("'").join("\\'")
         .split("\t").join("'")
         .replace(c.interpolate, "',$1,'")
         .split(c.start).join("');")
         .split(c.end).join("p.push('")
         + "');}return p.join('');");
  var fn = new Function('obj', code);
  return data ? fn(data) : fn;
};


// http://tools.ietf.org/html/rfc1459#section-6
// Standard numeric server replies to client commands. The name attributes
// get exported as module properties (e.g. irc.ERR_NOSUCHNICK).
//
// The template strings are compiled into objects, and are used by the
// client reply method, like so:
//     client.reply(irc.ERR_NOSUCHNICK, {nick: 'Jonesy'});

var replies = {
  401: { name: "ERR_NOSUCHNICK"
       , template: "{{nick}} :No such nick/channel" }
, 402: { name: "ERR_NOSUCHSERVER"
       , template: "{{server}} :No such server" }
, 403: { name: "ERR_NOSUCHCHANNEL"
       , template: "{{channel}} :No such channel" }
, 404: { name: "ERR_CANNOTSENDTOCHAN"
       , template: "{{channel}} :Cannot send to channel" }
, 405: { name: "ERR_TOOMANYCHANNELS"
       , template: "{{channel}} :You have joined too many channels" }
, 406: { name: "ERR_WASNOSUCHNICK"
       , template: "{{nick}} :There was no such nickname" }
, 407: { name: "ERR_TOOMANYTARGETS"
       , template: "{{target}} :Duplicate recipients. No message delivered" }
, 409: { name: "ERR_NOORIGIN"
       , template: ":No origin specified" }
, 411: { name: "ERR_NORECIPIENT"
       , template: ":No recipient given ({{command}})" }
, 412: { name: "ERR_NOTEXTTOSEND"
       , template: ":No text to send" }
, 413: { name: "ERR_NOTOPLEVEL"
       , template: "{{hostmask}} :No toplevel domain specified" }
, 414: { name: "ERR_WILDTOPLEVEL"
       , template: "{{hostmask}} :Wildcard in toplevel domain" }
, 421: { name: "ERR_UNKNOWNCOMMAND"
       , template: "{{command}} :Unknown command" }
, 422: { name: "ERR_NOMOTD"
       , template: ":MOTD File is missing" }
, 423: { name: "ERR_NOADMININFO"
       , template: "{{server}} :No administrative info available" }
, 424: { name: "ERR_FILEERROR"
       , template: ":File error doing {{fileop}} on {{file}}" }
, 431: { name: "ERR_NONICKNAMEGIVEN"
       , template: ":No nickname given" }
, 432: { name: "ERR_ERRONEUSNICKNAME"
       , template: "{{nick}} :Erroneus nickname" }
, 433: { name: "ERR_NICKNAMEINUSE"
       , template: "{{nick}} :Nickname is already in use" }
, 436: { name: "ERR_NICKCOLLISION"
       , template: "{{nick}} :Nickname collision KILL" }
, 441: { name: "ERR_USERNOTINCHANNEL"
       , template: "{{nick}} {{channel}} :They aren't on that channel" }
, 442: { name: "ERR_NOTONCHANNEL"
       , template: "{{channel}} :You're not on that channel" }
, 443: { name: "ERR_USERONCHANNEL"
       , template: "{{user}} {{channel}} :is already on channel" }
, 444: { name: "ERR_NOLOGIN"
       , template: "{{user}} :User not logged in" }
, 445: { name: "ERR_SUMMONDISABLED"
       , template: ":SUMMON has been disabled" }
, 446: { name: "ERR_USERSDISABLED"
       , template: ":USERS has been disabled" }
, 451: { name: "ERR_NOTREGISTERED"
       , template: ":You have not registered" }
, 461: { name: "ERR_NEEDMOREPARAMS"
       , template: "{{command}} :Not enough parameters" }
, 462: { name: "ERR_ALREADYREGISTRED"
       , template: ":You may not reregister" }
, 463: { name: "ERR_NOPERMFORHOST"
       , template: ":Your host isn't among the privileged" }
, 464: { name: "ERR_PASSWDMISMATCH"
       , template: ":Password incorrect" }
, 465: { name: "ERR_YOUREBANNEDCREEP"
       , template: ":You are banned from this server" }
, 467: { name: "ERR_KEYSET"
       , template: "{{channel}} :Channel key already set" }
, 471: { name: "ERR_CHANNELISFULL"
       , template: "{{channel}} :Cannot join channel (+l)" }
, 472: { name: "ERR_UNKNOWNMODE"
       , template: "{{char}} :is unknown mode char to me" }
, 473: { name: "ERR_INVITEONLYCHAN"
       , template: "{{channel}} :Cannot join channel (+i)" }
, 474: { name: "ERR_BANNEDFROMCHAN"
       , template: "{{channel}} :Cannot join channel (+b)" }
, 475: { name: "ERR_BADCHANNELKEY"
       , template: "{{channel}} :Cannot join channel (+k)" }
, 481: { name: "ERR_NOPRIVILEGES"
       , template: ":Permission Denied- You're not an IRC operator" }
, 482: { name: "ERR_CHANOPRIVSNEEDED"
       , template: "{{channel}} :You're not channel operator" }
, 483: { name: "ERR_CANTKILLSERVER"
       , template: ":You cant kill a server!" }
, 491: { name: "ERR_NOOPERHOST"
       , template: ":No O-lines for your host" }
, 501: { name: "ERR_UMODEUNKNOWNFLAG"
       , template: ":Unknown MODE flag" }
, 502: { name: "ERR_USERSDONTMATCH"
       , template: ":Cant change mode for other users" }
, 302: { name: "RPL_USERHOST"
       , template: ":[<reply>{<space><reply>}]" } // FIXME
, 303: { name: "RPL_ISON"
       , template: ":[<nick> {<space><nick>}]" } // FIXME
, 301: { name: "RPL_AWAY"
       , template: "{{nick}} :{{message}}" }
, 305: { name: "RPL_UNAWAY"
       , template: ":You are no longer marked as being away" }
, 306: { name: "RPL_NOWAWAY"
       , template: ":You have been marked as being away" }
, 311: { name: "RPL_WHOISUSER"
       , template: "{{nick}} {{user}} {{host}} * :{{realname}}" }
, 312: { name: "RPL_WHOISSERVER"
       , template: "{{nick}} {{server}} :{{serverinfo}}" }
, 313: { name: "RPL_WHOISOPERATOR"
       , template: "{{nick}} :is an IRC operator" }
, 317: { name: "RPL_WHOISIDLE"
       , template: "{{nick}} {{idle}} :seconds idle" }
, 318: { name: "RPL_ENDOFWHOIS"
       , template: "{{nick}} :End of /WHOIS list" }
, 319: { name: "RPL_WHOISCHANNELS"
       , template: "{{nick}} :{{channel}}" } // FIXME
, 314: { name: "RPL_WHOWASUSER"
       , template: "{{nick}} {{user}} {{host}} * :{{realname}}" }
, 369: { name: "RPL_ENDOFWHOWAS"
       , template: "{{nick}} :End of WHOWAS" }
, 321: { name: "RPL_LISTSTART"
       , template: "Channel :Users  Name" }
, 322: { name: "RPL_LIST"
       , template: "{{channel}} {{count}} :" }
, 323: { name: "RPL_LISTEND"
       , template: ":End of /LIST" }
, 324: { name: "RPL_CHANNELMODEIS"
       , template: "{{channel}} {{mode}} {{params}}" }
, 331: { name: "RPL_NOTOPIC"
       , template: "{{channel}} :No topic is set" }
, 332: { name: "RPL_TOPIC"
       , template: "{{channel}} :{{topic}}" }
, 341: { name: "RPL_INVITING"
       , template: "{{channel}} {{nick}}" }
, 342: { name: "RPL_SUMMONING"
       , template: "{{user}} :Summoning user to IRC" }
, 351: { name: "RPL_VERSION"
       , template: "{{version}} {{server}} :{{comments}}" }
, 352: { name: "RPL_WHOREPLY"
       , template: "{{channel}} {{user}} {{host}} {{server}} {{nick}} {{mode}} :{{hopcount}} {{realname}}" }
, 315: { name: "RPL_ENDOFWHO"
       , template: "{{name}} :End of /WHO list" }
, 353: { name: "RPL_NAMREPLY"
       , template: "@ {{channel}} :{{nicks}}" }
, 366: { name: "RPL_ENDOFNAMES"
       , template: "{{channel}} :End of /NAMES list" }
, 364: { name: "RPL_LINKS"
       , template: "{{hostmask}} {{server}} :{{hopcount}} {{serverinfo}}" }
, 365: { name: "RPL_ENDOFLINKS"
       , template: "{{hostmask}} :End of /LINKS list" }
, 367: { name: "RPL_BANLIST"
       , template: "{{channel}} {{banid}}" }
, 368: { name: "RPL_ENDOFBANLIST"
       , template: "{{channel}} :End of channel ban list" }
, 371: { name: "RPL_INFO"
       , template: ":{{info}}" }
, 374: { name: "RPL_ENDOFINFO"
       , template: ":End of /INFO list" }
, 375: { name: "RPL_MOTDSTART"
       , template: ":- {{server}} Message of the day - " }
, 372: { name: "RPL_MOTD"
       , template: ":- {{motd}}" }
, 376: { name: "RPL_ENDOFMOTD"
       , template: ":End of /MOTD command" }
, 381: { name: "RPL_YOUREOPER"
       , template: ":You are now an IRC operator" }
, 382: { name: "RPL_REHASHING"
       , template: " :Rehashing" }
, 391: { name: "RPL_TIME"
       , template: "{{server}} :{{time}}" }
, 392: { name: "RPL_USERSSTART"
       , template: ":UserID   Terminal  Host" }
, 393: { name: "RPL_USERS"
       , template: ":%-8s %-9s %-8s" }
, 394: { name: "RPL_ENDOFUSERS"
       , template: ":End of users" }
, 395: { name: "RPL_NOUSERS"
       , template: ":Nobody logged in" }
, 200: { name: "RPL_TRACELINK"
       , template: "Link {{version}} {{destination}} {{next}}" }
, 201: { name: "RPL_TRACECONNECTING"
       , template: "Try. {{cls}} {{server}}" }
, 202: { name: "RPL_TRACEHANDSHAKE"
       , template: "H.S. {{cls}} {{server}}" }
, 203: { name: "RPL_TRACEUNKNOWN"
       , template: "???? {{cls}} {{ip}}" }
, 204: { name: "RPL_TRACEOPERATOR"
       , template: "Oper {{cls}} {{nick}}" }
, 205: { name: "RPL_TRACEUSER"
       , template: "User {{cls}} {{nick}}" }
, 206: { name: "RPL_TRACESERVER"
       , template: "Serv {{cls}} {{s}}S {{c}}C {{server}} {{hostmask}}" }
, 208: { name: "RPL_TRACENEWTYPE"
       , template: "{{type}} 0 {{name}}" }
, 261: { name: "RPL_TRACELOG"
       , template: "File {{log}} {{debuglevel}}" }
, 211: { name: "RPL_STATSLINKINFO"
       , template: "{{name}} {{sendQueue}} {{sentMessages}} {{sentBytes}} {{receivedMessages}} {{receivedBytes}} {{uptime}}" }
, 212: { name: "RPL_STATSCOMMANDS"
       , template: "{{command}} {{count}}" }
, 213: { name: "RPL_STATSCLINE"
       , template: "C {{host}} * {{name}} {{port}} {{cls}}" }
, 214: { name: "RPL_STATSNLINE"
       , template: "N {{host}} * {{name}} {{port}} {{cls}}" }
, 215: { name: "RPL_STATSILINE"
       , template: "I {{host}} * {{host}} {{port}} {{cls}}" }
, 216: { name: "RPL_STATSKLINE"
       , template: "K {{host}} * {{user}} {{port}} {{cls}}" }
, 218: { name: "RPL_STATSYLINE"
       , template: "Y {{cls}} {{pingFrequency}} {{connectFrequency}} {{maxSendQueue}}" }
, 219: { name: "RPL_ENDOFSTATS"
       , template: "{{letter}} :End of /STATS report" }
, 241: { name: "RPL_STATSLLINE"
       , template: "L {{hostmask}} * {{server}} {{maxdepth}}" }
, 242: { name: "RPL_STATSUPTIME"
       , template: ":Server Up %d days %d:%02d:%02d" }
, 243: { name: "RPL_STATSOLINE"
       , template: "O {{hostmask}} * {{name}}" }
, 244: { name: "RPL_STATSHLINE"
       , template: "H {{hostmask}} * {{server}}" }
, 221: { name: "RPL_UMODEIS"
       , template: "{{mode}}" }
, 251: { name: "RPL_LUSERCLIENT"
       , template: ":There are {{userCount}} users and {{invisibleCount}} invisible on {{serverCount}} servers" }
, 252: { name: "RPL_LUSEROP"
       , template: "{{count}} :operator(s) online" }
, 253: { name: "RPL_LUSERUNKNOWN"
       , template: "{{count}} :unknown connection(s)" }
, 254: { name: "RPL_LUSERCHANNELS"
       , template: "{{count}} :channels formed" }
, 255: { name: "RPL_LUSERME"
       , template: ":I have {{clientCount}} clients and {{serverCount}} servers" }
, 256: { name: "RPL_ADMINME"
       , template: "{{server}} :Administrative info" }
, 257: { name: "RPL_ADMINLOC1"
       , template: ":{{location}}" }
, 258: { name: "RPL_ADMINLOC2"
       , template: ":{{location}}" }
, 259: { name: "RPL_ADMINEMAIL"
       , template: ":{{email}}" }
};
var repliesByCode = {};
Object.keys(replies).forEach(function(code) {
  var reply = replies[code];
  reply.template = template(reply.template);
  repliesByCode[code] = reply;
  exports[reply.name] = code;
});


// server = irc.createServer(function(client) {
//   client.reply(irc.)
// });
exports.createServer = function(callback) {
  var server = new Server(callback);
  return server;
};


// This server just spawns client objects -- it doesn't actually manage them.
function Server(callback) {
  var self = this;
  net.Server.call(self, function(stream) {
    // emit an event with a new client object, whenever someone connects
    self.emit('client', new Client(self, stream));
  });
  if (callback) {
    self.addListener('client', callback);
  }
}
sys.inherits(Server, net.Server);
exports.Server = Server;

Object.defineProperties(Server.prototype, {
  host: {
    get: function() {
      if (!this._host) {
        var address = this.address();
        this._host = address.address;
        this._port = address.port;
      }
      return this._host;
    }
  }
  
, port: {
    get: function() {
      if (!this._host) {
        var address = this.address();
        this._host = address.address;
        this._port = address.port;
      }
      return this._port;
    }
  }
});


// The client object does most of the work. It buffers the stream's data
// events until it gets a "\r\n", then attempts to parse it as an IRC message.
// If the message is parsed, it will emit a "message" event. Any errors
// parsing will emit an "error" event.
function Client(server, stream) {
  var self = this;
  events.EventEmitter.call(self);
  self.server = server;
  self.stream = stream;
  self.stream.setEncoding('utf8');
  self.stream.setTimeout(0);
  self.stream.addListener('connect', function() {
    self.emit('connect');
  });
  var buffer = '';
  self.stream.addListener('data', function(data) {
    try {
      buffer += data;  // FIXME: check buffer length after parsing
      var index;
      while ((index = buffer.indexOf('\r\n')) > 0) {
        var message = buffer.slice(0, index);
        if (message.length > 512) {
          self.stream.close();
        } else {
          buffer = buffer.slice(index + 2);
          self.parse(message);
        }
      }
    } catch (err) {
      error(err);
    }
  });
  self.stream.addListener('end', function() {
    self.stream.close();
  });
  self.stream.addListener('close', function() {
    self.emit('close');
  });
}
sys.inherits(Client, events.EventEmitter);
exports.Client = Client;

Object.defineProperties(Client.prototype, {
  hostmask: {
    get: function() {
      return this.nick + '!~' + this.names.user + '@' + this.names.host;
    }
  }
  
, names: {
    get: function() {
      return this._names;
    },
    
    // Sets the new names, as sent by the USER message. If the user is not
    // yet registered, and both the names and the nick are set, this will
    // also set registered to true.
    //
    // It is expected that the value will be an object with the attributes:
    // - user: the client's username
    // - host: the client's hostname
    // - server: the client's servername
    // - realname: the client's full name (e.g. "Prince Adam")
    // 
    // See: http://tools.ietf.org/html/rfc1459#section-4.1.3
    set: function(names) {
      this._names = names;
      if (!this.registered && this.nick) {
        this.registered = true;
      }
    }
  }
  
, nick: {
    get: function() {
      return this._nick;
    },
    
    // Sets the new nick, as sent by the NICK message. If the user is not
    // yet registered, and both the names and the nick are set, this will
    // also set registered to true.
    set: function(nick) {
      this._nick = nick;
      if (!this.registered && this.names) {
        this.registered = true;
      }
    }
  }
  
, registered: {
    get: function() {
      return !!this._registered;
    },
    
    // If set to true, will emit a "reigstered" event.
    set: function(registered) {
      this._registered = registered;
      if (this._registered) {
        this.emit('registered');
      }
    }
  }
});

// This regex matches IRC message strings.
// See: http://tools.ietf.org/html/rfc1459#section-2.3.1
var messagePattern = new RegExp(
  '^' +
  '(?:\\:([^\\s]+) +)?' +          // :prefix
  '([A-Za-z0-9]+)\\s*' +           // command
  '((?:[^\\:\\s][^\\s]*\\s*)*)' +  // middle1 middle2 middle3
  '(?:\\s+\\:(.*))?' +             // :trailing
  '$');

// Parse a message we've recieved from the client. If the message is formatted
// correctly, emit a "message" event. Otherwise, emit an "error" event.
Client.prototype.parse = function(message) {
  debug('recv> ', sys.inspect(message));
  message = message.trim();
  if (!message) {
    return;
  }
  var matches = messagePattern.exec(message);
  if (!matches) {
    self.emit('error', new Error('Error parsing message'), message);
    return;
  }
  var prefix = matches[1];
  var command = matches[2].toLowerCase();
  var args = (matches[3] || '').split(' ').filter(function(arg) {
    return !!arg.trim();
  });
  if (matches[4]) {
    args.push(matches[4]);
  }
  this.emit('message', prefix, command, args);
};

// Builds a message for a standard server reply code, using the repliesByCode
// object defined earlier in this file. Throws a TypeError if the passed
// code is invalid.
// See: http://tools.ietf.org/html/rfc1459#section-6
Client.prototype.reply = function(code, context) {
  var reply = repliesByCode[code];
  if (reply) {
    code = String(code);
    while (code.length < 3) {
      code = '0' + code;
    }
    this.write('localhost', code, [this.nick, reply.template(context)]);
  } else {
    throw new TypeError('Unknown reply code "' + code + '"');
  }
};

// Writes a standard IRC message, of the form:
//    :prefix command arg1 arg2 arg3 ... :arg4 with spaces
//
// See: http://tools.ietf.org/html/rfc1459#section-2.3.1
Client.prototype.write = function(prefix, command, args) {
  if (arguments.length < 3) {
    args = arguments[1];
    command = arguments[0];
    prefix = undefined;
  }
  args = args || [];
  var message = [];
  if (prefix) {
    message.push(prefix.charAt(0) === ':' ? prefix : (':' + prefix));
  }
  message.push(command);
  message = message.concat(args).join(' ');
  debug('send> ', sys.inspect(message));
  this.stream.write(message + '\r\n');
};
