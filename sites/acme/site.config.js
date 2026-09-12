'use strict';

// Example site "acme" — a simple form-login site. Rename/replace for real use.
module.exports = {
  name: 'acme',
  baseURL: process.env.ACME_BASE_URL || 'https://acme.example.com',
  auth: {
    enabled: true,
    userEnv: 'ACME_USER',
    passEnv: 'ACME_PASS',
    loginPath: '/login',
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: 'button[type=submit]',
    successURL: '**/dashboard',
  },
};
