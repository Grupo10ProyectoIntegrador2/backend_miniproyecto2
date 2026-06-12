import { db } from '../config/firebase';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { deleteRoomsAndMembershipsByUser } from './rooms.service';

// ─── Avatar ────────────────────────────────────────────────────────────────

/**
 * Genera la URL de Gravatar a partir del correo electrónico.
 * Si el usuario tiene foto en Gravatar, se muestra; si no, se usa
 * un identicon generado automáticamente (d=identicon).
 */
export function getAvatarUrl(email: string): string {
    const normalized = email.trim().toLowerCase();
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    return `https://www.gravatar.com/avatar/${hash}?s=200&d=identicon`;
}


// ─── Validaciones de formato ───────────────────────────────────────────────

export function validateUsername(username: string): { valid: boolean; error?: string } {
    const trimmed = username?.trim() ?? '';
    if (trimmed.length === 0) {
        return { valid: false, error: 'El nombre de usuario no puede estar vacío.' };
    }

    if (trimmed.length < 3) {
        return { valid: false, error: 'El nombre de usuario debe tener al menos 3 caracteres.' };
    }

    if (trimmed.length > 30) {
        return { valid: false, error: 'El nombre de usuario no puede superar los 30 caracteres.' };
    }

    if (/^(\d)\1+$/.test(trimmed)) {
        return { valid: false, error: 'El nombre de usuario no puede ser solo números repetidos.' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return { valid: false, error: 'El nombre de usuario solo puede contener letras, números, guiones y guiones bajos.' };
    }

    return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
    if (!email || email.trim().length === 0) {
        return { valid: false, error: 'El correo electrónico no puede estar vacío.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'El formato del correo electrónico no es válido.' };
    }

    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) {
        return { valid: false, error: 'El formato del correo electrónico no es válido.' };
    }

    if (/^(\d)\1+$/.test(localPart)) {
        return { valid: false, error: 'El correo electrónico no es válido.' };
    }

    // ── Validación de correo institucional (.edu) ──
    // Acepta: algo.edu, algo.edu.co, algo.edu.es, algo.edu.mx, etc.
    const eduRegex = /\.edu(\.[a-z]{2,})?$/i;
    if (!eduRegex.test(domain)) {
        return {
            valid: false,
            error: 'Solo se aceptan correos institucionales con dominio .edu (por ejemplo: usc.edu.co, correounivalle.edu.co, uao.edu.es).',
        };
    }

    return { valid: true };
}

export function validateNames(firstName: string, lastName: string): { valid: boolean; error?: string } {
    if (!firstName || firstName.trim().length === 0) {
        return { valid: false, error: 'El nombre no puede estar vacío.' };
    }

    if (!lastName || lastName.trim().length === 0) {
        return { valid: false, error: 'El apellido no puede estar vacío.' };
    }

    if (firstName.trim().length < 2) {
        return { valid: false, error: 'El nombre debe tener al menos 2 caracteres.' };
    }

    if (lastName.trim().length < 2) {
        return { valid: false, error: 'El apellido debe tener al menos 2 caracteres.' };
    }

    if (/^\d+$/.test(firstName.trim())) {
        return { valid: false, error: 'El nombre no puede contener solo números.' };
    }

    if (/^\d+$/.test(lastName.trim())) {
        return { valid: false, error: 'El apellido no puede contener solo números.' };
    }

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(firstName)) {
        return { valid: false, error: 'El nombre solo puede contener letras.' };
    }

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(lastName)) {
        return { valid: false, error: 'El apellido solo puede contener letras.' };
    }

    return { valid: true };
}


// ─── Firestore: verificar existencia ──────────────────────────────────────

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
        throw new Error('No se pudo verificar la disponibilidad del nombre de usuario. Intenta de nuevo.');
    }
}

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
        throw new Error('No se pudo verificar la disponibilidad del correo. Intenta de nuevo.');
    }
}


// ─── Firestore: CRUD de perfil ─────────────────────────────────────────────

export interface UserProfile {
    uid: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    avatarUrl: string;
    provider: 'email' | 'google';
    createdAt: string;
    updatedAt?: string;
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
        const userDoc: UserProfile = {
            uid,
            ...profileData,
            username: profileData.username.toLowerCase(),
            email: profileData.email.toLowerCase(),
            createdAt: new Date().toISOString(),
        };

        await db.collection('users').doc(uid).set(userDoc);
    } catch (error) {
        console.error('Error guardando perfil de usuario:', error);
        throw new Error('No se pudo guardar el perfil. Intenta de nuevo más tarde.');
    }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
        const doc = await db.collection('users').doc(uid).get();

        if (!doc.exists) {
            return null;
        }

        return doc.data() as UserProfile;
    } catch (error) {
        console.error('Error obteniendo perfil de usuario:', error);
        return null;
    }
}

export async function updateUserProfile(uid: string, updates: {
    firstName?: string;
    lastName?: string;
    username?: string;
    avatarUrl?: string;
    email?: string;
}): Promise<void> {
    try {
        const payload: Record<string, string> = {
            updatedAt: new Date().toISOString(),
        };

        if (updates.firstName !== undefined) payload.firstName = updates.firstName.trim();
        if (updates.lastName  !== undefined) payload.lastName  = updates.lastName.trim();
        if (updates.avatarUrl !== undefined) payload.avatarUrl = updates.avatarUrl;
        if (updates.username  !== undefined) payload.username  = updates.username.toLowerCase();
        if (updates.email     !== undefined) payload.email     = updates.email.toLowerCase();

        await db.collection('users').doc(uid).update(payload);
    } catch (error) {
        console.error('Error actualizando perfil de usuario:', error);
        throw new Error('No se pudo actualizar el perfil. Intenta de nuevo más tarde.');
    }
}

export async function deleteUserProfile(uid: string): Promise<void> {
    try {
        // Eliminar las salas creadas por el usuario y todos sus memberships asociados
        await deleteRoomsAndMembershipsByUser(uid);

        // Eliminar documento de Firestore
        await db.collection('users').doc(uid).delete();

        // Eliminar usuario de Firebase Auth
        await admin.auth().deleteUser(uid);
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        throw new Error('No se pudo eliminar la cuenta. Intenta de nuevo más tarde.');
    }
}