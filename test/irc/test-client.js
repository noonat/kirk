var assert = require('assert')
  , net = require('net')
  , sys = require('sys')
  , runner = require('../runner')
  , irc = require('../../lib/irc');

// irc.debug = true;

var PORT = runner.port();

var server = irc.createServer(function(client) {
  client.addListener('registered', function() {
    assert.equal('heman!~princea@eternia', client.hostmask);
    client.write(server.host, '001', [client.nick, ':Welcome']);
  });
  var packet = 0;
  client.addListener('message', function(prefix, command, args) {
    assert.ok(packet < 3, 'should only receive 2 message events');
    switch (packet) {
      case 0:
        assert.equal(command, 'nick');
        assert.deepEqual(args, ['heman']);
        client.nick = args[0];
        break;
      
      case 1:
        assert.equal(command, 'user');
        assert.deepEqual(
          args, ['princea', 'eternia', 'localhost', 'Prince Adam']);
        client.names = {
          user: args[0], host: args[1], server: args[2], realname: args[3]};
        break;
      
      case 2:
        assert.equal(prefix, 'foo');
        assert.equal(command, 'bar');
        assert.deepEqual(args, ['baz', 'biff', 'xyzzy plugh phuce']);
        client.reply(irc.RPL_INFO, {info: 'this is a test reply'});
        break;
    }
    packet++;
  });
  client.addListener('close', function() {
    server.close();
  });
});
server.listen(PORT);

var socket = net.createConnection(PORT);
(function() {
  socket.setTimeout(1000);
  
  socket.addListener('connect', function() {
    socket.write('NICK heman\r\n');
    socket.write('USER princea eternia localhost :Prince Adam\r\n');
  });

  var packet = 0, recv = [''];
  socket.addListener('data', function(data) {
    recv += data.toString('binary');
    var line, lines = recv.split('\r\n');
    recv = lines.pop();
    while (line = lines.shift()) {
      assert.ok(packet < 2, 'should only receive 1 data event');
      switch (packet) {
        case 0:
          assert.equal(':0.0.0.0 001 heman :Welcome', line);
          socket.write(':foo bar baz biff :xyzzy plugh phuce\r\n');
          break;
        
        case 1:
          assert.equal(':0.0.0.0 371 heman :this is a test reply', line);
          socket.end();
          break;
      }
      packet++;
    }
  });
  
  socket.addListener('error', function(err) {
    throw err;
  });
  
  socket.addListener('end', function() {
    assert.equal('', packet);
    socket.end();
  });
  
  socket.addListener('timeout', function() {
     server.close();
  });
})();
