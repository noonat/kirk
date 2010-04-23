# kirk

kirk is an IRC -> Campfire proxy running on node.js. A bot joins Campfire in
your place, and pretends that the people in Campfire are also in your IRC
channel.

kirk does not join existing IRC servers. Instead, it runs a local barebones IRC
server, expressly for the purpose of proxying Campfire.

## Known issues

* When idle, the bot will get kicked out of the Campfire room every 20 minutes.
  This means you get a bit of spam as he leaves and joins.
* Twitter and download messages are not handled yet.
* Unlock and idle messages don't show in IRC: this is a bug in the Campfire
  streaming API.
