var assert = require('assert')
  , t = require('../../lib/irc').template;

assert.equal('foo', t('foo', {}));  // render immediately
assert.equal('foo', t('foo')({}));  // render later, passing an object
assert.equal('foo', t('foo')());    // render later, passing nothing
for (var f = t('foo'), i = 0; i < 10; ++i)
  assert.equal('foo', f());

assert.throws(function() {
  t('foo <%= bar %>')({});
}, ReferenceError, 'Should throw for undefined variables.');

assert.equal('foo ^_^', t('foo <%= bar %>', {bar: '^_^'}));
assert.equal('foo ^_^', t('foo <%= bar %>')({bar: '^_^'}));
for (var f = t('foo <%= bar %>'), i = 0; i < 10; ++i)
  assert.equal('foo ^_^', f({bar: '^_^'}));

var f = t(
  'foo ' +
  '<% for (var i = 0; i < count; i++) { %>' +
    '<%= i + 1 %>' +
    '<% if (i === count - 1) { %>' +
    'GOGOGADGETTEMPLATE!' +
    '<% } %>' +
  '<% } %>');
assert.equal('foo 123456789GOGOGADGETTEMPLATE!', f({count: 9}));
