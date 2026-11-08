/* A-Store Firebase web configuration.
   These browser-side identifiers are public by design, not service-account secrets.
   Firestore Security Rules remain the authority for privileged operations. */
var firebaseConfig = {
  apiKey: "AIzaSyD19CJ4qS-CEfq3kMknMNwy8S4zSJ3UreI",
  authDomain: "griffiti-portfolio.firebaseapp.com",
  projectId: "griffiti-portfolio",
  storageBucket: "griffiti-portfolio.firebasestorage.app",
  messagingSenderId: "439801982789",
  appId: "1:439801982789:web:feeb6f640a69bbde46d82c"
};

// Expose the configuration for the A-Store data bridge.
var ADMIN_UID = "hBiWnwZeM5fFpC643SCZKTaw7am2";
window.firebaseConfig = firebaseConfig;
window.ADMIN_UID = ADMIN_UID;
