'use strict';

// Vercel serverless entry point. Vercel invokes the exported Express app
// as a request handler.
const { createApp } = require('../app');

module.exports = createApp();
