import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error('FIREBASE_PROJECT_ID no está definido');
}

let credential: admin.credential.Credential;

const credPath = path.join(__dirname, '../../firebase-adminsdk.json');
if (fs.existsSync(credPath)) {
  credential = admin.credential.cert(require(credPath));
} else {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!privateKey || !clientEmail) {
    throw new Error('Firebase credentials no están definidas');
  }

  credential = admin.credential.cert({
    projectId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    clientEmail,
  });
}

admin.initializeApp({
  credential,
  projectId,
});

export const db = admin.firestore();