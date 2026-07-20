'use strict';

const { createApp } = require('./app');

const app = createApp();
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`PDF splitter running at http://localhost:${port}`);
});
