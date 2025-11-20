// Firebase placeholder setup. Fill firebaseConfig with your project's values.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  // apiKey: '',
  // authDomain: '',
  // projectId: '',
  // storageBucket: '',
  // messagingSenderId: '',
  // appId: '',
}

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
