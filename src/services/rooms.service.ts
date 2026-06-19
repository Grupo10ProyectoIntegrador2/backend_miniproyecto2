import { db } from '../config/firebase';
import { getUserProfile, type UserProfile } from './validation.service';
import { deleteMessagesByRoomId } from './messages.service';
import { commitBatchDeletes } from '../utils/firestore';

export interface Room {
    id: string;
    name: string;
    createdBy: string;
    createdAt: string;
    status: 'active' | 'inactive';
}

export interface RoomMembership {
    id: string;
    roomId: string;
    uid: string;
    joinedAt: string;
}

export interface RoomParticipant extends UserProfile {
    joinedAt: string;
    role: 'Administrador' | 'Participante';
}

export async function createRoom(name: string, createdBy: string): Promise<Room> {
    try {
        const roomRef = db.collection('rooms').doc();
        const roomDoc: Room = {
            id: roomRef.id,
            name: name.trim(),
            createdBy,
            createdAt: new Date().toISOString(),
            status: 'active',
        };

        const membershipId = `${roomRef.id}_${createdBy}`;
        const membershipDoc: RoomMembership = {
            id: membershipId,
            roomId: roomRef.id,
            uid: createdBy,
            joinedAt: new Date().toISOString(),
        };

        await db.runTransaction(async (transaction) => {
            transaction.set(roomRef, roomDoc);
            transaction.set(db.collection('room_memberships').doc(membershipId), membershipDoc);
        });

        return roomDoc;
    } catch (error) {
        console.error('Error al crear sala en Firestore:', error);
        throw new Error('No se pudo crear la sala. Intenta de nuevo más tarde.');
    }
}

export async function getAllRooms(): Promise<Room[]> {
    try {
        const snapshot = await db
            .collection('rooms')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .get();

        const rooms: Room[] = [];
        snapshot.forEach((doc) => {
            rooms.push(doc.data() as Room);
        });

        return rooms;
    } catch (error) {
        console.error('Error al obtener salas de Firestore:', error);
        throw new Error('No se pudieron obtener las salas. Intenta de nuevo más tarde.');
    }
}

export async function getRoomById(id: string): Promise<Room | null> {
    try {
        const doc = await db.collection('rooms').doc(id).get();
        if (!doc.exists) {
            return null;
        }
        return doc.data() as Room;
    } catch (error) {
        console.error(`Error al obtener la sala con ID ${id}:`, error);
        return null;
    }
}

export async function isRoomMember(roomId: string, uid: string): Promise<boolean> {
    try {
        const membershipId = `${roomId}_${uid}`;
        const doc = await db.collection('room_memberships').doc(membershipId).get();
        return doc.exists;
    } catch (error) {
        console.error(`Error verificando membership de ${uid} en sala ${roomId}:`, error);
        return false;
    }
}

export async function joinRoom(roomId: string, uid: string): Promise<Room> {
    try {
        const room = await getRoomById(roomId);

        if (!room) {
            throw new Error('La sala no existe.');
        }

        if (room.status !== 'active') {
            throw new Error('La sala no está activa.');
        }

        const membershipId = `${roomId}_${uid}`;
        const membershipRef = db.collection('room_memberships').doc(membershipId);
        const membershipDoc = await membershipRef.get();

        if (!membershipDoc.exists) {
            await membershipRef.set({
                id: membershipId,
                roomId,
                uid,
                joinedAt: new Date().toISOString(),
            });
        }

        return room;
    } catch (error) {
        console.error(`Error al unir usuario ${uid} a la sala ${roomId}:`, error);
        throw error instanceof Error ? error : new Error('No se pudo unir a la sala.');
    }
}

export async function getRoomParticipantsByRoomId(roomId: string): Promise<RoomParticipant[]> {
    try {
        const room = await getRoomById(roomId);

        if (!room) {
            throw new Error('La sala no existe.');
        }

        const membershipsSnapshot = await db
            .collection('room_memberships')
            .where('roomId', '==', roomId)
            .get();

        const participants = await Promise.all(
            membershipsSnapshot.docs.map(async (doc) => {
                const membership = doc.data() as RoomMembership;
                const profile = await getUserProfile(membership.uid);

                const fallbackProfile: UserProfile = {
                    uid: membership.uid,
                    firstName: 'Usuario',
                    lastName: 'de la sala',
                    username: membership.uid,
                    email: `${membership.uid}@example.edu`,
                    avatarUrl: '',
                    provider: 'email',
                    createdAt: membership.joinedAt,
                };

                const user = profile ?? fallbackProfile;

                const role: RoomParticipant['role'] = room.createdBy === membership.uid ? 'Administrador' : 'Participante';

                return {
                    ...user,
                    joinedAt: membership.joinedAt,
                    role: role,
                };
            })
        );

        return participants.sort((a, b) => {
            if (a.role !== b.role) {
                return a.role === 'Administrador' ? -1 : 1;
            }

            return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
        });
    } catch (error) {
        console.error(`Error al obtener participantes de la sala ${roomId}:`, error);
        throw new Error('No se pudieron obtener los participantes de la sala.');
    }
}

export async function getJoinedRoomsByUser(uid: string): Promise<Room[]> {
    try {
        const membershipsSnapshot = await db
            .collection('room_memberships')
            .where('uid', '==', uid)
            .get();

        if (membershipsSnapshot.empty) {
            return [];
        }

        const roomIds = membershipsSnapshot.docs.map((doc) => doc.data().roomId as string);
        const roomsSnapshot = await Promise.all(
            roomIds.map((roomId) => db.collection('rooms').doc(roomId).get())
        );

        return roomsSnapshot
            .filter((doc) => doc.exists)
            .map((doc) => doc.data() as Room)
            .filter((room) => room.status === 'active');
    } catch (error) {
        console.error(`Error al obtener salas unidas para el usuario ${uid}:`, error);
        throw new Error('No se pudieron obtener las salas unidas. Intenta de nuevo más tarde.');
    }
}

export async function deleteRoomsAndMembershipsByUser(uid: string): Promise<void> {
    try {
        const createdRoomsSnapshot = await db
            .collection('rooms')
            .where('createdBy', '==', uid)
            .get();

        const docsToDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];

        for (const roomDoc of createdRoomsSnapshot.docs) {
            const roomId = roomDoc.id;

            const roomMembershipsSnapshot = await db
                .collection('room_memberships')
                .where('roomId', '==', roomId)
                .get();

            docsToDelete.push(...roomMembershipsSnapshot.docs);
            docsToDelete.push(roomDoc);
        }

        const ownMembershipsSnapshot = await db
            .collection('room_memberships')
            .where('uid', '==', uid)
            .get();

        docsToDelete.push(...ownMembershipsSnapshot.docs);

        await commitBatchDeletes(docsToDelete);

        for (const roomDoc of createdRoomsSnapshot.docs) {
            await deleteMessagesByRoomId(roomDoc.id);
        }
    } catch (error) {
        console.error(`Error al eliminar salas y memberships del usuario ${uid}:`, error);
        throw new Error('No se pudieron eliminar las salas del usuario. Intenta de nuevo más tarde.');
    }
}

export async function updateRoomName(roomId: string, newName: string, uid: string): Promise<Room> {
    try {
        const roomRef = db.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();

        if (!roomDoc.exists) {
            throw new Error('La sala no existe.');
        }

        const roomData = roomDoc.data() as Room;

        if (roomData.createdBy !== uid) {
            throw new Error('No tienes permisos para editar esta sala.');
        }

        const trimmedName = newName.trim();
        await roomRef.update({ name: trimmedName });

        return { ...roomData, name: trimmedName };
    } catch (error) {
        console.error(`Error al editar la sala ${roomId}:`, error);
        throw error instanceof Error ? error : new Error('No se pudo editar la sala.');
    }
}

export async function deleteRoom(roomId: string, uid: string): Promise<void> {
    try {
        const roomRef = db.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();

        if (!roomDoc.exists) {
            throw new Error('La sala no existe.');
        }

        const roomData = roomDoc.data() as Room;

        if (roomData.createdBy !== uid) {
            throw new Error('No tienes permisos para eliminar esta sala.');
        }

        const membershipsSnapshot = await db
            .collection('room_memberships')
            .where('roomId', '==', roomId)
            .get();

        const batch = db.batch();
        batch.delete(roomRef);
        membershipsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        await deleteMessagesByRoomId(roomId);
    } catch (error) {
        console.error(`Error al eliminar la sala ${roomId}:`, error);
        throw error instanceof Error ? error : new Error('No se pudo eliminar la sala.');
    }
}
