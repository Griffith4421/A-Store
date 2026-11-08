/* Copy this file to config.js and enter the public Firebase web config
   and the administrator's Firebase Authentication UID. */
var firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
var ADMIN_UID = "YOUR_FIREBASE_USER_UID";
window.firebaseConfig = firebaseConfig;
window.ADMIN_UID = ADMIN_UID;
