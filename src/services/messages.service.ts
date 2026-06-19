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

import { commitBatchDeletes } from '../utils/firestore';

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

export async function getRoomMessages(roomId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<ChatMessage[]> {
    const snapshot = await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

    return snapshot.docs.map((doc) => doc.data() as ChatMessage).reverse();
}

export async function deleteMessagesByRoomId(roomId: string): Promise<void> {
    const snapshot = await db
        .collection('rooms')
        .doc(roomId)
        .collection('messages')
        .get();

    if (snapshot.empty) {
        return;
    }

    await commitBatchDeletes(snapshot.docs);
}
