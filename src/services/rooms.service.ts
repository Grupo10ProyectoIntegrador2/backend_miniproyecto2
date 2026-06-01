import { db } from '../config/firebase';

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

/**
 * Crea una nueva sala en la base de datos Firestore con un ID único autogenerado.
 * 
 * @param name Nombre de la sala
 * @param createdBy UID del usuario creador
 * @returns La sala recién creada
 */
export async function createRoom(name: string, createdBy: string): Promise<Room> {
    try {
        const roomRef = db.collection('rooms').doc(); // Genera un documento con ID único
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

/**
 * Recupera todas las salas con estado activo de la base de datos Firestore,
 * ordenadas por fecha de creación descendente.
 * 
 * @returns Un arreglo con las salas activas
 */
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

/**
 * Obtiene el detalle de una sala específica por su ID.
 * 
 * @param id ID único de la sala
 * @returns La sala si existe, o null en caso contrario
 */
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

/**
 * Une a un usuario a una sala activa.
 *
 * @param roomId ID de la sala
 * @param uid UID del usuario
 * @returns La sala a la que se unió
 */
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

/**
 * Obtiene únicamente las salas a las que un usuario se ha unido.
 *
 * @param uid UID del usuario
 * @returns Lista de salas unidas por el usuario
 */
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
