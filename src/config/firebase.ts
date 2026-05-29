import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!projectId || !privateKey || !clientEmail) {
  throw new Error('Firebase credentials no están definidas en las variables de entorno');
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    clientEmail,
  }),
  projectId,
});

export const db = admin.firestore();