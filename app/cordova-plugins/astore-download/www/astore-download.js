/* Native Android download bridge for A-Store. */
const exec = require('cordova/exec');
const SERVICE = 'AStoreDownload';
exports.enqueue = function (options, success, error) {
  exec(success, error, SERVICE, 'enqueue', [options || {}]);
};
exports.query = function (downloadId, success, error) {
  exec(success, error, SERVICE, 'query', [String(downloadId)]);
};
exports.openApk = function (downloadId, success, error) {
  exec(success, error, SERVICE, 'openApk', [String(downloadId)]);
};
