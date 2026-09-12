'use strict';

// Registers the login "setup" for this site using its config.
// Only runs when PW_REUSE_AUTH=1 and this site's auth.enabled is true.
require('../../lib/site-auth').registerAuthSetup(require('./site.config'));
