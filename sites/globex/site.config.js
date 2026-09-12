'use strict';

// Example site "globex" — shows a site that needs NO login (auth disabled).
// It still gets its own seen/facts memory namespace.
module.exports = {
  name: 'globex',
  baseURL: process.env.GLOBEX_BASE_URL || 'https://globex.example.com',
  auth: {
    enabled: false,
  },
};
