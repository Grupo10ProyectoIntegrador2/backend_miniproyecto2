import { Router } from 'express';
import type { Response } from 'express';
import { 
    createRoom, 
    getAllRooms, 
    joinRoom, 
    getJoinedRoomsByUser,
    updateRoomName,
    deleteRoom,
    getRoomById,
    isRoomMember,
} from '../services/rooms.service';
import { getRoomMessages } from '../services/messages.service';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// Helper para respuestas de error limpias
function userError(res: Response, status: number, message: string) {
    return res.status(status).json({ success: false, message });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /rooms - Crear una sala
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /rooms:
 *   post:
 *     summary: Crea una nueva sala de chat/reunión (Requiere Autenticación)
 *     tags: [Salas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre descriptivo de la sala (mínimo 3 caracteres)
 *                 example: Sala de Programación Web
 *     responses:
 *       201:
 *         description: Sala creada exitosamente
 *       400:
 *         description: Parámetros inválidos o faltantes
 *       401:
 *         description: No autorizado (Token inválido o ausente)
 *       500:
 *         description: Error interno del servidor
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name } = req.body;
        const creatorUid = req.user!.uid; // Obtenido de forma segura desde el token

        // Validar parámetros obligatorios
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return userError(res, 400, 'El nombre de la sala es obligatorio y no puede estar vacío.');
        }

        const trimmedName = name.trim();

        // Validaciones del nombre de la sala
        if (trimmedName.length < 3) {
            return userError(res, 400, 'El nombre de la sala debe tener al menos 3 caracteres.');
        }

        if (trimmedName.length > 50) {
            return userError(res, 400, 'El nombre de la sala no puede superar los 50 caracteres.');
        }

        // Crear la sala usando el servicio
        const newRoom = await createRoom(trimmedName, creatorUid);

        res.status(201).json({
            success: true,
            message: 'Sala creada exitosamente.',
            room: newRoom,
        });
    } catch (error: any) {
        console.error('Error en POST /rooms:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Ocurrió un problema al crear la sala. Intenta de nuevo más tarde.',
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /rooms - Listar salas activas
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /rooms:
 *   get:
 *     summary: Obtiene la lista de todas las salas de chat activas (Requiere Autenticación)
 *     tags: [Salas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de salas activas obtenida exitosamente
 *       401:
 *         description: No autorizado (Token inválido o ausente)
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
        const activeRooms = await getAllRooms();

        res.json({
            success: true,
            rooms: activeRooms,
        });
    } catch (error: any) {
        console.error('Error en GET /rooms:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'No se pudieron recuperar las salas en este momento. Intenta más tarde.',
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /rooms/:roomId/join - Unirse a una sala
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /rooms/{roomId}/join:
 *   post:
 *     summary: Une al usuario autenticado a una sala activa
 *     tags: [Salas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario unido exitosamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Sala no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.post('/:roomId/join', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const roomIdParam = req.params['roomId'];
        const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
        const uid = req.user?.uid;

        if (!roomId || roomId.trim().length === 0) {
            return userError(res, 400, 'El identificador de la sala es obligatorio.');
        }

        if (!uid) {
            return userError(res, 401, 'No se pudo identificar al usuario autenticado.');
        }

        const room = await joinRoom(roomId, uid);

        res.json({
            success: true,
            message: 'Te uniste a la sala exitosamente.',
            room,
        });
    } catch (error: any) {
        const message = error?.message || 'No se pudo unir a la sala. Intenta nuevamente.';

        if (message === 'La sala no existe.') {
            return userError(res, 404, message);
        }

        if (message === 'La sala no está activa.') {
            return userError(res, 400, message);
        }

        console.error('Error en POST /rooms/:roomId/join:', error);
        res.status(500).json({
            success: false,
            message,
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /rooms/joined - Listar solo las salas del usuario autenticado
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /rooms/joined:
 *   get:
 *     summary: Obtiene únicamente las salas a las que el usuario autenticado se unió
 *     tags: [Salas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de salas unidas obtenida exitosamente
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.get('/joined', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const uid = req.user?.uid;

        if (!uid) {
            return userError(res, 401, 'No se pudo identificar al usuario autenticado.');
        }

        const rooms = await getJoinedRoomsByUser(uid);

        res.json({
            success: true,
            rooms,
        });
    } catch (error: any) {
        console.error('Error en GET /rooms/joined:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'No se pudieron recuperar tus salas. Intenta más tarde.',
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /rooms/:roomId/messages - Historial de chat de una sala
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /rooms/{roomId}/messages:
 *   get:
 *     summary: Obtiene el historial de mensajes de una sala (Requiere ser miembro)
 *     tags: [Salas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Historial obtenido exitosamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Sin acceso a la sala
 *       404:
 *         description: Sala no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.get('/:roomId/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const roomIdParam = req.params['roomId'];
        const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
        const uid = req.user!.uid;

        if (!roomId || roomId.trim().length === 0) {
            return userError(res, 400, 'El identificador de la sala es obligatorio.');
        }

        const trimmedRoomId = roomId.trim();
        const room = await getRoomById(trimmedRoomId);

        if (!room) {
            return userError(res, 404, 'La sala no existe.');
        }

        if (room.status !== 'active') {
            return userError(res, 400, 'La sala no está activa.');
        }

        const isMember = await isRoomMember(trimmedRoomId, uid);
        if (!isMember) {
            return userError(res, 403, 'No tienes acceso al chat de esta sala.');
        }

        const messages = await getRoomMessages(trimmedRoomId);

        res.json({
            success: true,
            roomId: trimmedRoomId,
            messages,
        });
    } catch (error: unknown) {
        console.error('Error en GET /rooms/:roomId/messages:', error);
        const message = error instanceof Error ? error.message : 'No se pudo obtener el historial de chat.';
        res.status(500).json({ success: false, message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /rooms/:roomId - Editar el nombre de una sala
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /rooms/{roomId}:
 *   put:
 *     summary: Edita el nombre de una sala (Solo el Anfitrión)
 *     tags: [Salas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nuevo nombre de la sala (mínimo 3 caracteres)
 *                 example: Sala de Algoritmos Avanzados
 *     responses:
 *       200:
 *         description: Sala editada exitosamente
 *       400:
 *         description: Nombre inválido o vacío
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido (El usuario no es el creador de la sala)
 *       404:
 *         description: Sala no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.put('/:roomId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const roomIdParam = req.params['roomId'];
        const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
        const { name } = req.body;
        const uid = req.user!.uid;

        // Asegurar que el roomId sea válido y de tipo string puro
        if (!roomId || roomId.trim().length === 0) {
            return userError(res, 400, 'El identificador de la sala es obligatorio.');
        }

        // Validaciones idénticas a la creación
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return userError(res, 400, 'El nuevo nombre de la sala es obligatorio.');
        }

        const trimmedName = name.trim();
        if (trimmedName.length < 3 || trimmedName.length > 50) {
            return userError(res, 400, 'El nombre debe tener entre 3 y 50 caracteres.');
        }

        const updatedRoom = await updateRoomName(roomId, trimmedName, uid);

        res.json({
            success: true,
            message: 'Sala actualizada exitosamente.',
            room: updatedRoom,
        });
    } catch (error: any) {
        const message = error?.message || 'No se pudo editar la sala.';

        if (message === 'La sala no existe.') return userError(res, 404, message);
        if (message === 'No tienes permisos para editar esta sala.') return userError(res, 403, message);

        console.error('Error en PUT /rooms/:roomId:', error);
        res.status(500).json({ success: false, message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /rooms/:roomId - Eliminar una sala
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /rooms/{roomId}:
 *   delete:
 *     summary: Elimina una sala y todos sus accesos (Solo el Anfitrión)
 *     tags: [Salas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sala eliminada exitosamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido (El usuario no es el creador de la sala)
 *       404:
 *         description: Sala no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.delete('/:roomId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const roomIdParam = req.params['roomId'];
        const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
        const uid = req.user!.uid;

        // Asegurar que el roomId sea válido y de tipo string puro
        if (!roomId || roomId.trim().length === 0) {
            return userError(res, 400, 'El identificador de la sala es obligatorio.');
        }

        await deleteRoom(roomId, uid);

        res.json({
            success: true,
            message: 'Sala eliminada exitosamente junto a todos sus accesos.',
        });
    } catch (error: any) {
        const message = error?.message || 'No se pudo eliminar la sala.';

        if (message === 'La sala no existe.') return userError(res, 404, message);
        if (message === 'No tienes permisos para eliminar esta sala.') return userError(res, 403, message);

        console.error('Error en DELETE /rooms/:roomId:', error);
        res.status(500).json({ success: false, message });
    }
});
export default router;
