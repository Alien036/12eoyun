import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAEkBhWZUMJGcMypsexHszLTrr3nRXoVuI",
  authDomain: "e-block-blast.firebaseapp.com",
  projectId: "e-block-blast",
  storageBucket: "e-block-blast.firebasestorage.app",
  messagingSenderId: "925477036281",
  appId: "1:925477036281:web:71e090644e81f425178228",
  measurementId: "G-GWDWTYX939",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const initAnalytics = async () => {
  if (typeof window !== "undefined" && (await isSupported())) {
    return getAnalytics(app);
  }
  return null;
};

export { app, db, initAnalytics };
