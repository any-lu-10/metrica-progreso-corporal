import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB4wcN-4mjV3V31j0fAQbahY-BL7x0EfZI",
  authDomain: "gym-tracker-7e06a.firebaseapp.com",
  projectId: "gym-tracker-7e06a",
  storageBucket: "gym-tracker-7e06a.firebasestorage.app",
  messagingSenderId: "239295753992",
  appId: "1:239295753992:web:0822061602870c58ae46bd",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
