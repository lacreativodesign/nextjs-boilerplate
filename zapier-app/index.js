const authentication = require('./authentication');
const triggers = require('./triggers');
const creates = require('./actions');
const searches = require('./searches');

module.exports = {
  version: '1.0.0',
  platformVersion: require('zapier-platform-core').version,
  authentication,
  triggers,
  creates,
  searches,
};
