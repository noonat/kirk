exports.kirk = {
  subdomains: {
    'example': {  // example.campfirenow.com
      token: '4795fbede7ohaiiminurkey1a71fee9653fb09c1'  // api token
    }
  },
  channels: {
    '#foobar': {             // irc channel to mirror the room
      subdomain: 'example',  // campfire subdomain from the list above
      name: 'Foo Bar'        // name of the campfire room
    }
  }
};
