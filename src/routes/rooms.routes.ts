import { Router } from 'express';
import type { Router as ExpressRouter, Response } from 'express'
import { createRoom, getAllRooms, getJoinedRoomsByUser, getRoomParticipantsByRoomId, joinRoom } from '../services/rooms.service';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router:ExpressRouter = Router();

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
// GET /rooms/:roomId/participants - Participantes de una sala
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:roomId/participants', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const roomIdParam = req.params['roomId'];
        const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;

        if (!roomId || roomId.trim().length === 0) {
            return userError(res, 400, 'El identificador de la sala es obligatorio.');
        }

        const participants = await getRoomParticipantsByRoomId(roomId);

        res.json({
            success: true,
            participants,
        });
    } catch (error: any) {
        const message = error?.message || 'No se pudieron recuperar los participantes de la sala.';

        if (message === 'La sala no existe.') {
            return userError(res, 404, message);
        }

        console.error('Error en GET /rooms/:roomId/participants:', error);
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

export default router;
