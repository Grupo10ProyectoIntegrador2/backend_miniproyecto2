import { db } from '../config/firebase';
import { getUserProfile } from './validation.service';

export interface ChatMessage {
    id: string;
    roomId: string;
    senderUid: string;
    senderName: string;
    senderUsername: string;
    content: string;
    createdAt: string;
}

export const MAX_MESSAGE_LENGTH = 2000;
export const DEFAULT_HISTORY_LIMIT = 200;

/**
 * Valida el contenido de un mensaje de chat.
 * Rechaza vacíos, solo espacios o demasiado largos.
 */
export function validateMessageContent(content: string): { valid: true; trimmed: string } | { valid: false; error: string } {
    if (typeof content !== 'string') {
        return { valid: false, error: 'El mensaje debe ser texto.' };
    }

    const trimmed = content.trim();

    if (trimmed.length === 0) {
        return { valid: false, error: 'El mensaje no puede estar vacío.' };
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        return {
            valid: false,
            error: `El mensaje no puede superar los ${MAX_MESSAGE_LENGTH} caracteres.`,
        };
    }

    return { valid: true, trimmed };
}

/**
 * Guarda un mensaje en Firestore y lo retorna con metadatos del remitente.
 */
export async function saveRoomMessage(roomId: string, senderUid: string, content: string): Promise<ChatMessage> {
    const validation = validateMessageContent(content);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const profile = await getUserProfile(senderUid);
    const senderName = profile
        ? `${profile.firstName} ${profile.lastName}`.trim()
        : 'Participante';
    const senderUsername = profile?.username ?? senderUid;

    // Usamos subcolección
    const messageRef = db.collection('rooms').doc(roomId).collection('messages').doc();
    const message: ChatMessage = {
        id: messageRef.id,
        roomId,
        senderUid,
        senderName,
        senderUsername,
        content: validation.trimmed,
        createdAt: new Date().toISOString(),
    };

    await messageRef.set(message);
    return message;
}

/**
 * Recupera el historial de mensajes de una sala, del más antiguo al más reciente.
 */
export async function getRoomMessages(roomId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<ChatMessage[]> {
    // Apuntamos a la subcolección 
    const snapshot = await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .orderBy('createdAt', 'asc')
        .limit(limit)
        .get();

    return snapshot.docs.map((doc) => doc.data() as ChatMessage);
}

/**
 * Elimina todos los mensajes asociados a una sala.
 */
export async function deleteMessagesByRoomId(roomId: string): Promise<void> {
    // Obtenemos todos los documentos de la subcolección
    const snapshot = await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .get();

    if (snapshot.empty) {
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
}
