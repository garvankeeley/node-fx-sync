
module.exports = function (xhr, jwcrypto) {

if (!xhr) xhr = require('xmlhttprequest').XMLHttpRequest;
if (!jwcrypto) {
  jwcrypto = require('browserid-crypto');
  require("browserid-crypto/lib/algs/ds");
  require("browserid-crypto/lib/algs/rs");

  //require("jwcrypto/lib/algs/rs");
  //require("jwcrypto/lib/algs/ds");
}
//if (!P) P = require('p-promise');
var FxAccountsClient = null;

if (typeof FxAccountClient === 'undefined') {
   FxAccountsClient = require('fxa-js-client');
} else {
  FxAccountsClient = FxAccountClient; // that is the export name from latest fxa-js-client
}

var certDuration = 3600 * 24 * 365;

/*
 * 1. use fxa-client to log in to Fxa with email password
 * 2. generate a BrowserID keypair
 * 3. send public key to fxa server and get a cert
 * 4. generate a BrowserID assertion with the new cert
 */

function FxUser(creds, options) {
  this.email = creds.email;
  this.password = creds.password;
  this.options = options;
  this.client = new FxAccountsClient(
    this.options.fxaServerUrl || 'http://127.0.0.1:9000',
    { xhr: xhr }
  );
}

FxUser.prototype.auth = function() {
  var self = this;
  const credsFile = '/tmp/creds.json';
  // try read creds, if have them, return
  try {
    if (typeof window !== 'undefined') {
      this.creds = CREDS_PRESET;
    } else {
      const diskCreds = require('fs').readFileSync(credsFile).toString();
      this.creds = JSON.parse(diskCreds);
      return Promise.resolve(this);
    }
  } catch (e) {}

  const signInOk = (creds) => {
    self.creds = creds;
    return self.client.accountKeys(creds.keyFetchToken, creds.unwrapBKey);
  };
  return this.client.signIn(this.email, this.password, { keys: true })
    .then(signInOk, err => {
      console.log('signin fail:' + err.message);
      this.client.sendUnblockCode(this.email);

      return new Promise((resolve, reject) => {
        const unblocker = () => {
          var fs = require('fs');
          var path = '/tmp/unblocker';
          try {
            const buffer = fs.readFileSync(path);
            const unblockCode = buffer.toString();
            console.log('unblocker: ' + unblockCode);
            resolve(this.client.signIn(this.email, this.password, { keys: true, unblockCode: unblockCode })
              .then(signInOk));
          } catch (e) {
            console.log('wait for code in ' + path);
            setTimeout(unblocker, 1000);
          }
        };
        unblocker();
      });
    })
    .then(function (result) {
      self.creds.kB = result.kB;
      self.creds.kA = result.kA;
      require('fs').writeFileSync(credsFile, JSON.stringify(self.creds), 'utf-8');
      return self;
    }, err => {
      console.log(err.message);
    });
};

FxUser.prototype._exists = function(email) {
  var client = new FxAccountsClient(this.options.fxaServerUrl);
  return client.accountExists(email);
}

FxUser.prototype.setup = function() {
  var self = this;
  var client;

  // initialize the client and obtain keys
  return this.auth()
    .then(
      function () {
        return self.client.recoveryEmailStatus(self.creds.sessionToken);
      }
    )
    .then(
      function (status) {
        if (status.verified) {
          return self.creds;
        } else {
          // poll for verification or throw?
          throw new Error("Unverified account");
        }
      }
    )
    .then(
      function (creds) {
        // set the sync key
        self.syncKey = Buffer(creds.kB, 'hex');
        return new Promise((resolve, reject) => {
          // upon allocation of a user, we'll gen a keypair and get a signed cert
          jwcrypto.generateKeypair({ algorithm: "DS", keysize: 256 }, function(err, kp) {
            if (err) return reject(err);
            var duration = self.options.certDuration || certDuration;
            self._keyPair = kp;
            var expiration = +new Date() + duration;

            self.client.certificateSign(self.creds.sessionToken, kp.publicKey.toSimpleObject(), duration)
              .then(
                function (cert) {
                  self._cert = cert.cert;
                  resolve(self);
                },
                reject
              );
          });
        });
      }
    );
};

FxUser.prototype.getCert = function(keyPair) {
  var duration = typeof this.options.certDuration !== 'undefined' ?
                    this.options.certDuration :
                    60 * 60 * 1000;
  return this.client.certificateSign(this.creds.sessionToken, keyPair.publicKey.toSimpleObject(), duration)
    .done(
      function (cert) {
        self._cert = cert.cert;
        deferred.resolve(self);
      },
      deferred.reject
    );
};

FxUser.prototype.getAssertion = function (audience, duration) {
  var self = this;
  var expirationDate = +new Date() + (typeof duration !== 'undefined' ? duration : 60 * 60 * 1000);
  return new Promise((resolve, reject) => {
    jwcrypto.assertion.sign({},
      {
        audience: audience,
        issuer: this.options.fxaServerUrl,
        expiresAt: expirationDate
      },
      this._keyPair.secretKey,
      (err, signedObject) => {
        if (err) return reject(err);

        var backedAssertion = jwcrypto.cert.bundle([self._cert], signedObject);
        resolve(backedAssertion);
      });
  });
};

return FxUser;

};
