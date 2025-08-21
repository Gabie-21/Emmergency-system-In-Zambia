// firebase-config.js
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

export const firebaseConfig = {
  apiKey: "AIzaSyATFnJ_nufdoN4QAcYLjXsZd-eANz988h8",
  authDomain: "zambia-emergency-response.firebaseapp.com",
  projectId: "zambia-emergency-response",
  storageBucket: "zambia-emergency-response.firebasestorage.app",
  messagingSenderId: "745207632001",
  appId: "1:745207632001:web:11754eaed394e960708b80",
  measurementId: "G-BLS7RYQKVB"
};

// Initialize Firebase (this will be imported in main.js)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);

// Collection names for consistency
export const COLLECTIONS = {
  EMERGENCIES: 'emergencies',
  RESPONDERS: 'responders',
  USERS: 'users',
  MESSAGES: 'emergency_messages'
};

// Emergency types
export const EMERGENCY_TYPES = {
  MEDICAL: 'medical',
  FIRE: 'fire',
  POLICE: 'police', 
  GENERAL: 'general'
};

// Emergency priorities
export const EMERGENCY_PRIORITIES = {
  P1: 'CRITICAL',
  P2: 'URGENT',
  P3: 'IMPORTANT'
};

console.log('Firebase initialized successfully');