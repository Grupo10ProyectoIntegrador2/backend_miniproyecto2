import { db } from '../config/firebase';

//verificar si un username ya existe en firestore
export async function checkUsernameExists(username: string): Promise<boolean> {
    try {
        const snapshot = await db
            .collection('users')
            .where('username', '==', username.toLowerCase())
            .limit(1)
            .get();

        return !snapshot.empty;
    } catch (error) {
        console.error('Error validando username:', error);
        throw new Error('Error al validar username');
    }
}


//verificar si un email ya existe en firestore
export async function checkEmailExists(email: string): Promise<boolean> {
    try {
        const snapshot = await db
            .collection('users')
            .where('email', '==', email.toLowerCase())
            .limit(1)
            .get();

        return !snapshot.empty;
    } catch (error) {
        console.error('Error validando email:', error);
        throw new Error('Error al validar email');
    }
}