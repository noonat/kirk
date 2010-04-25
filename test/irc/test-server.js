var assert = require('assert')
  , net = require('net')
  , runner = require('../runner')
  , irc = require('../../lib/irc');

var PORT = runner.port();

var serverClientCount = 0;
var server = irc.createServer(function(serverClient) {
  var i = serverClientCount++;
  serverClient.stream.write('\n');
  serverClient.stream.end();
  assert.ok(serverClient instanceof irc.Client);
  if (i === 0) {
    server.close();
  }
});
assert.ok(server instanceof irc.Server);
assert.ok(server instanceof net.Server);

server.listen(6667);

var client = net.createConnection(6667);
client.setTimeout(1000);
client.addListener('error', function(err) {
  throw err;
});
client.addListener('end', function() {
  client.end();
});
client.addListener('timeout', function() {
   server.close();
});

process.addListener('exit', function() {
  assert.equal(1, serverClientCount);
});
