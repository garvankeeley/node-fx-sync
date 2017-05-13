
module.exports = function(FxaUser, Crypto) {
if (!FxaUser) FxaUser = require('./fxaUser')();
if (!Crypto) Crypto = require('./crypto')();

function FxaSyncAuth(syncAuth, options) {
  this.syncAuth = syncAuth;
  this.options = options;
}

FxaSyncAuth.prototype.auth = function(creds) {
  var user = new FxaUser(creds, this.options);
  return user.setup()
    .then(() => {
      this.keys = user.syncKey;
      return user.getAssertion(this.options.audience, this.options.duration);
    })
    .then(assertion => {
      var clientState = Crypto.computeClientState(user.syncKey);
      return this.syncAuth.auth(assertion, clientState);
    }, err => {
      console.log(err.message);
    })
    .then(token => {
      return {
        token: token,
        keys: this.keys,
        credentials: {
          sessionToken: user.creds.sessionToken,
          keyPair: user._keyPair
        }
      };
    });
};

return FxaSyncAuth;

};
