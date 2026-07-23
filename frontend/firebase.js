// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GithubAuthProvider, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD5CDYsJnDgY48ZPbTaqI5wFjoZXhIz8WA",
  authDomain: "cortai-33071.firebaseapp.com",
  projectId: "cortai-33071",
  storageBucket: "cortai-33071.firebasestorage.app",
  messagingSenderId: "936789630757",
  appId: "1:936789630757:web:d091654e5a5f68245b84cc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth=getAuth(app)
export const googleProvider =
  new GoogleAuthProvider();

export const githubProvider =
  new GithubAuthProvider();