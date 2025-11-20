// Firebase placeholder setup. Fill firebaseConfig with your project's values.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyASxLywso5Tbnw5m4xdjHZNm4xaC75vIx8",
  authDomain: "potstirrers-e6c5d.firebaseapp.com",
  projectId: "potstirrers-e6c5d",
  storageBucket: "potstirrers-e6c5d.firebasestorage.app",
  messagingSenderId: "517944238594",
  appId: "1:517944238594:web:9f73991ea01beae11d7d1b",
  measurementId: "G-25T1R4VWJJ"
};

const hasFirebase = typeof firebaseConfig.apiKey === 'string' && firebaseConfig.apiKey.length > 0

let app
let auth
let db

if (hasFirebase) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
}

export { auth, db, hasFirebase }
