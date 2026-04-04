const dotenv = require('dotenv');
dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}
module.exports = {
PORT:process.env.PORT,
CESIUM_ION_TOKEN:process.env.CESIUM_ION_TOKEN
};