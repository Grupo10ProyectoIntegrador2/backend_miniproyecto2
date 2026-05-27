import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const projectId = process.env.FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error('FIREBASE_PROJECT_ID no está definido en .env');
}

admin.initializeApp({
    projectId,
});

export const db = admin.firestore();