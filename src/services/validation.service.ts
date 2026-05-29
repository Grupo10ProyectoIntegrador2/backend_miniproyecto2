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


export async function saveUserProfile(uid: string, profileData: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    avatarUrl: string;
    provider: 'email' | 'google';
}): Promise<void> {
    try {
        const userDoc = {
            uid,
            ...profileData,
            username: profileData.username.toLowerCase(),
            createdAt: new Date().toISOString(),
        };

        await db.collection('users').doc(uid).set(userDoc);
    } catch (error) {
        console.error('Error saving user profile', error);
        throw new Error('Error saving user profile');
    }
}


export async function getUserProfile(uid: string): Promise<any> {
    try {
        const doc = await db.collection('users').doc(uid).get();

        if (!doc.exists) {
            return null; // En lugar de throw, devolvemos null
        }

        return doc.data();
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null; // Devolvemos null incluso en caso de error
    }
}

// Validaciones adicionales
export function validateUsername(username: string): { valid: boolean; error?: string } {
    // No vacío
    if (!username || username.trim().length === 0) {
        return { valid: false, error: 'Username no puede estar vacío' };
    }

    // Mínimo 3 caracteres
    if (username.length < 3) {
        return { valid: false, error: 'Username debe tener al menos 3 caracteres' };
    }

    // No puede ser solo números repetidos (0000, 1111, etc.)
    if (/^(\d)\1+$/.test(username)) {
        return { valid: false, error: 'Username no puede ser solo números repetidos' };
    }

    // Solo letras, números, guiones y guiones bajos
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return { valid: false, error: 'Username solo puede contener letras, números, guiones y guiones bajos' };
    }

    return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
    // No vacío
    if (!email || email.trim().length === 0) {
        return { valid: false, error: 'Email no puede estar vacío' };
    }

    // Formato válido de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Email inválido' };
    }

    // Validar que la parte local (antes del @) no sea solo números repetidos
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) {
        return { valid: false, error: 'Email inválido' };
    }

    if (/^(\d)\1+$/.test(localPart)) {
        return { valid: false, error: 'Email inválido' };
    }

    // Validar que el dominio no sea solo números repetidos
    const domainName = domain.split('.')[0];
    if (!domainName) {
        return { valid: false, error: 'Email inválido' };
    }

    if (/^(\d)\1+$/.test(domainName)) {
        return { valid: false, error: 'Email inválido' };
    }

    return { valid: true };
}

export function validateNames(firstName: string, lastName: string): { valid: boolean; error?: string } {
    // No vacíos ni solo espacios
    if (!firstName || firstName.trim().length === 0) {
        return { valid: false, error: 'Nombre no puede estar vacío' };
    }

    if (!lastName || lastName.trim().length === 0) {
        return { valid: false, error: 'Apellido no puede estar vacío' };
    }

    // Mínimo 2 caracteres cada uno
    if (firstName.trim().length < 2) {
        return { valid: false, error: 'Nombre debe tener al menos 2 caracteres' };
    }

    if (lastName.trim().length < 2) {
        return { valid: false, error: 'Apellido debe tener al menos 2 caracteres' };
    }

    // No puede ser solo números
    if (/^\d+$/.test(firstName.trim())) {
        return { valid: false, error: 'Nombre no puede ser solo números' };
    }

    if (/^\d+$/.test(lastName.trim())) {
        return { valid: false, error: 'Apellido no puede ser solo números' };
    }

    // Solo letras y espacios
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚ\s]+$/.test(firstName)) {
        return { valid: false, error: 'Nombre solo puede contener letras' };
    }

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚ\s]+$/.test(lastName)) {
        return { valid: false, error: 'Apellido solo puede contener letras' };
    }

    return { valid: true };
}