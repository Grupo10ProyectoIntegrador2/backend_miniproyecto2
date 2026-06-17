import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAuthToken, type AuthUser } from '../middlewares/auth.middleware';
import { getRoomMessages, saveRoomMessage } from '../services/messages.service';
import { getRoomById, isRoomMember } from '../services/rooms.service';

interface SendMessagePayload {
    roomId: string;
    content: string;
}


function getSocketUser(socket: Socket): AuthUser {
    const user = socket.data.user;
    if (!user) {
        throw new Error('Usuario de socket no autenticado.');
    }
    return user as AuthUser;
}

async function assertCanAccessRoom(socket: Socket, roomId: string): Promise<string | null> {
    const trimmedRoomId = roomId?.trim?.() ?? '';

    if (!trimmedRoomId) {
        return 'El identificador de la sala es obligatorio.';
    }

    const room = await getRoomById(trimmedRoomId);
    if (!room) {
        return 'La sala no existe.';
    }

    if (room.status !== 'active') {
        return 'La sala no está activa.';
    }

    const { uid } = getSocketUser(socket);
    const isMember = await isRoomMember(trimmedRoomId, uid);
    if (!isMember) {
        return 'No tienes acceso al chat de esta sala.';
    }

    return null;
}

export function initSocket(httpServer: HttpServer): Server {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : '*';

    const io = new Server(httpServer, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
        },
    });

    io.use(async (socket, next) => {
        // Busca el token en 'auth' (Frontend web estándar) o en 'query' (Postman)
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;

        if (typeof token !== 'string' || token.trim().length === 0) {
            return next(new Error('Autenticación requerida.'));
        }

        const user = await verifyAuthToken(token);
        if (!user) {
            return next(new Error('Token inválido o expirado.'));
        }

        socket.data.user = user;
        return next();
    });

    io.on('connection', (socket: Socket) => {
        const { uid } = getSocketUser(socket);
        console.log(`[Socket.IO] Cliente conectado    | id: ${socket.id} | uid: ${uid}`);

        // ── Evento: unirse a una sala ────────────────────────────────────────
        socket.on('join-room', async (payload: { roomId: string; participant?: unknown } | string) => {
            try {
                const roomId = typeof payload === 'string' ? payload : payload.roomId;
                const participant = typeof payload === 'string' ? undefined : payload.participant;

                const accessError = await assertCanAccessRoom(socket, roomId);
                if (accessError) {
                    socket.emit('message-error', { message: accessError });
                    return;
                }

                const trimmedRoomId = roomId.trim();
                await socket.join(trimmedRoomId);
                console.log(`[Socket.IO] Socket ${socket.id} se unió a la sala: ${trimmedRoomId}`);

                const messages = await getRoomMessages(trimmedRoomId);
                socket.emit('chat-history', { roomId: trimmedRoomId, messages });

                socket.to(trimmedRoomId).emit('user-joined', {
                    roomId: trimmedRoomId,
                    participant,
                    socketId: socket.id,
                    uid,
                });
            } catch (error) {
                console.error('[Socket.IO] Error en join-room:', error);
                socket.emit('message-error', { message: 'No se pudo unir al chat de la sala.' });
            }
        });

        // ── Evento: salir de una sala ────────────────────────────────────────
        socket.on('leave-room', (roomId: string) => {
            const trimmedRoomId = roomId?.trim?.() ?? '';
            if (!trimmedRoomId) return;

            // Verificar si el socket realmente está en la sala antes de irse y notificar
            if (socket.rooms.has(trimmedRoomId)) {
                socket.leave(trimmedRoomId);
                console.log(`[Socket.IO] Socket ${socket.id} salió de la sala: ${trimmedRoomId}`);
                socket.to(trimmedRoomId).emit('user-left', { socketId: socket.id, uid });
            }
        });

        socket.on('send-message', async (payload: SendMessagePayload) => {
            try {
                if (!payload || typeof payload !== 'object') {
                    socket.emit('message-error', { message: 'Datos del mensaje inválidos.' });
                    return;
                }

                const { roomId, content } = payload;
                const accessError = await assertCanAccessRoom(socket, roomId);
                if (accessError) {
                    socket.emit('message-error', { message: accessError });
                    return;
                }

                const trimmedRoomId = roomId.trim();
                const message = await saveRoomMessage(trimmedRoomId, uid, content);

                io.to(trimmedRoomId).emit('new-message', message);
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : 'No se pudo enviar el mensaje.';

                socket.emit('message-error', { message });
            }
        });

        // ── Evento: desconexión ──────────────────────────────────────────────
        socket.on('disconnect', (reason: string) => {
            console.log(`[Socket.IO] Cliente desconectado | id: ${socket.id} | razón: ${reason}`);
        });

        // ── Evento: Answer ──────────────────────────────────────────────
        socket.on('offer', (payload: { targetSocketId: string, offer: any }) => {  
            try {
                if (!payload || !payload.targetSocketId || !payload.offer) return;

                socket.to(payload.targetSocketId).emit('offer', {
                    senderSocketId: socket.id,
                    offer: payload.offer
            });
            console.log(`[WebRTC] Oferta: ${socket.id} -> ${payload.targetSocketId}`);
        } catch (error) {
            console.error(`[WebRTC] Error procesando offer: `, error);
        }
        });

        // ── Evento: Answer ──────────────────────────────────────────────
        socket.on('answer', (payload: { targetSocketId: string, answer: any}) => {
            try {
                if (!payload || !payload.targetSocketId || !payload.answer) return;

                socket.to(payload.targetSocketId).emit('answer', {
                    senderSocketId: socket.id,
                    answer: payload.answer
                });
                console.log(`[WebRTC] Respuesta: ${socket.id} -> ${payload.targetSocketId}`);
            } catch (error) {
                console.log(`[WebRTC] Error procesando answer: `, error);
            }
        });

        // ── Evento: ice-candidate ──────────────────────────────────────────────
    });

    return io;
}
