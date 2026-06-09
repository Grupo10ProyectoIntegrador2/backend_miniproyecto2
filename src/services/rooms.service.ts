import { db } from '../config/firebase';
import { deleteMessagesByRoomId } from './messages.service';

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
 * Verifica si un usuario es miembro de una sala (tiene membership activo).
 */
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

/**
 * Elimina todas las salas creadas por un usuario y los memberships asociados a ellas.
 * También elimina los memberships propios del usuario en salas de terceros.
 *
 * @param uid UID del usuario a limpiar
 */
export async function deleteRoomsAndMembershipsByUser(uid: string): Promise<void> {
    try {
        // 1. Obtener todas las salas creadas por este usuario
        const createdRoomsSnapshot = await db
            .collection('rooms')
            .where('createdBy', '==', uid)
            .get();

        const batch = db.batch();

        // 2. Para cada sala creada, eliminar todos los memberships de esa sala (de cualquier usuario)
        //    y luego eliminar la sala misma.
        for (const roomDoc of createdRoomsSnapshot.docs) {
            const roomId = roomDoc.id;

            // Preparar borrado de memberships
            const roomMembershipsSnapshot = await db
                .collection('room_memberships')
                .where('roomId', '==', roomId)
                .get();

            roomMembershipsSnapshot.docs.forEach((membershipDoc) => {
                batch.delete(membershipDoc.ref);
            });

            // Preparar borrado de la sala
            batch.delete(roomDoc.ref);

            // 3. Eliminar mensajes de esya sala inmediatamente
            await deleteMessagesByRoomId(roomId);
        }

        // 4. Eliminar los memberships del usuario en salas de otros (donde no es creador)
        const ownMembershipsSnapshot = await db
            .collection('room_memberships')
            .where('uid', '==', uid)
            .get();

        ownMembershipsSnapshot.docs.forEach((membershipDoc) => {
            batch.delete(membershipDoc.ref);
        });

        // Ejecutamos todo el borrado de salas y membresías
        await batch.commit();
               
    } catch (error) {
        console.error(`Error al eliminar salas y memberships del usuario ${uid}:`, error);
        throw new Error('No se pudieron eliminar las salas del usuario. Intenta de nuevo más tarde.');
    }
}

/**
 * Edita el nombre de una sala existente.
 * Valida que el usuario que intenta editar sea el creador original.
 * @param roomId ID de la sala a editar
 * @param newName Nuevo nombre de la sala
 * @param uid UID del usuario que realiza la petición
 * @returns La sala actualizada
 */
export async function updateRoomName(roomId: string, newName: string, uid: string): Promise<Room> {
    try {
        const roomRef = db.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();

        if (!roomDoc.exists) {
            throw new Error('La sala no existe.');
        }

        const roomData = roomDoc.data() as Room;

        // Validación de seguridad 
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

/**
 * Elimina (desactiva) una sala existente de forma lógica o física.
 * Valida que el usuario que intenta eliminar sea el creador original.
 * @param roomId ID de la sala a eliminar
 * @param uid UID del usuario que realiza la petición
 */
export async function deleteRoom(roomId: string, uid: string): Promise<void> {
    try {
        const roomRef = db.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();

        if (!roomDoc.exists) {
            throw new Error('La sala no existe.');
        }

        const roomData = roomDoc.data() as Room;

        // Validación de seguridad 
        if (roomData.createdBy !== uid) {
            throw new Error('No tienes permisos para eliminar esta sala.');
        }

        // Opción de borrado físico
        const batch = db.batch();
        
        // 1. Borrar la sala
        batch.delete(roomRef);

        // 2. Borrar todos los participantes (memberships) de esa sala
        const membershipsSnapshot = await db
            .collection('room_memberships')
            .where('roomId', '==', roomId)
            .get();

        membershipsSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        // 3. Borrar historial de chat de la sala
        await deleteMessagesByRoomId(roomId);

        // 4. Ejecutamos el batch para borrar la sala
        await batch.commit();

    } catch (error) {
        console.error(`Error al eliminar la sala ${roomId}:`, error);
        throw error instanceof Error ? error : new Error('No se pudo eliminar la sala.');
    }
}
