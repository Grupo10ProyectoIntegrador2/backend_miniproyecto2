import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAuthToken, type AuthUser } from '../middlewares/auth.middleware';
import { getRoomMessages, saveRoomMessage } from '../services/messages.service';
import { getRoomById, isRoomMember } from '../services/rooms.service';

interface SendMessagePayload {
    roomId: string;
    content: string;
}

interface VideoCallEntry {
    uid: string;
    participant?: unknown;
    socketId: string;
    audioMuted?: boolean;
    videoMuted?: boolean;
    isScreenSharing?: boolean;
}

/** roomId -> uid -> video call participant */
const activeVideoCalls = new Map<string, Map<string, VideoCallEntry>>();

function buildVideoCallStatus(roomId: string) {
    const roomCall = activeVideoCalls.get(roomId);
    const entries = roomCall ? Array.from(roomCall.values()) : [];

    return {
        roomId,
        active: entries.length > 0,
        count: entries.length,
        uids: entries.map((entry) => entry.uid),
        participants: entries
            .map((entry) => entry.participant)
            .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant)),
        states: entries.map((entry) => ({
            uid: entry.uid,
            socketId: entry.socketId,
            audioMuted: entry.audioMuted ?? false,
            videoMuted: entry.videoMuted ?? false,
            isScreenSharing: entry.isScreenSharing ?? false
        })),
    };
}

function broadcastVideoCallStatus(io: Server, roomId: string) {
    io.to(roomId).emit('video-call-status', buildVideoCallStatus(roomId));
}

function removeUserFromVideoCall(io: Server, socket: Socket, roomId: string, notify = true): boolean {
    const roomCall = activeVideoCalls.get(roomId);
    if (!roomCall) return false;

    const { uid } = getSocketUser(socket);
    const removed = roomCall.delete(uid);

    if (roomCall.size === 0) {
        activeVideoCalls.delete(roomId);
    }

    if (removed && notify) {
        broadcastVideoCallStatus(io, roomId);
    }

    return removed;
}

function removeUserFromAllVideoCalls(io: Server, socket: Socket) {
    const { uid } = getSocketUser(socket);

    for (const [roomId, roomCall] of activeVideoCalls.entries()) {
        if (roomCall.has(uid)) {
            roomCall.delete(uid);
            if (roomCall.size === 0) {
                activeVideoCalls.delete(roomId);
            }
            broadcastVideoCallStatus(io, roomId);
        }
    }
}

async function emitRoomPresence(io: Server, socket: Socket, roomId: string) {
    const socketsInRoom = await io.in(roomId).fetchSockets();
    const users = socketsInRoom
        .filter((roomSocket) => roomSocket.id !== socket.id)
        .map((roomSocket) => ({
            socketId: roomSocket.id,
            uid: (roomSocket.data.user as AuthUser).uid,
            participant: (roomSocket.data.participant as unknown) ?? undefined,
        }));

    socket.emit('room-presence', { roomId, users });
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
                socket.data.participant = participant;
                await socket.join(trimmedRoomId);
                console.log(`[Socket.IO] Socket ${socket.id} se unió a la sala: ${trimmedRoomId}`);

                const messages = await getRoomMessages(trimmedRoomId);
                socket.emit('chat-history', { roomId: trimmedRoomId, messages });
                socket.emit('video-call-status', buildVideoCallStatus(trimmedRoomId));
                await emitRoomPresence(io, socket, trimmedRoomId);

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
                removeUserFromVideoCall(io, socket, trimmedRoomId);
                socket.leave(trimmedRoomId);
                console.log(`[Socket.IO] Socket ${socket.id} salió de la sala: ${trimmedRoomId}`);
                socket.to(trimmedRoomId).emit('user-left', { socketId: socket.id, uid });
            }
        });

        // ── Evento: unirse a videollamada ───────────────────────────────────
        socket.on('join-video-call', async (payload: { roomId: string; participant?: unknown }) => {
            try {
                if (!payload?.roomId) return;

                const accessError = await assertCanAccessRoom(socket, payload.roomId);
                if (accessError) {
                    socket.emit('message-error', { message: accessError });
                    return;
                }

                const trimmedRoomId = payload.roomId.trim();
                if (!socket.rooms.has(trimmedRoomId)) {
                    socket.emit('message-error', { message: 'Debes estar conectado al chat de la sala.' });
                    return;
                }

                if (!activeVideoCalls.has(trimmedRoomId)) {
                    activeVideoCalls.set(trimmedRoomId, new Map());
                }

                activeVideoCalls.get(trimmedRoomId)!.set(uid, {
                    uid,
                    participant: payload.participant,
                    socketId: socket.id,
                });

                console.log(`[VideoCall] ${uid} se unió a la videollamada en ${trimmedRoomId}`);
                broadcastVideoCallStatus(io, trimmedRoomId);
            } catch (error) {
                console.error('[VideoCall] Error en join-video-call:', error);
                socket.emit('message-error', { message: 'No se pudo unir a la videollamada.' });
            }
        });

        // ── Evento: salir de videollamada ───────────────────────────────────
        socket.on('leave-video-call', (payload: { roomId: string } | string) => {
            const roomId = typeof payload === 'string' ? payload : payload?.roomId;
            const trimmedRoomId = roomId?.trim?.() ?? '';
            if (!trimmedRoomId) return;

            const removed = removeUserFromVideoCall(io, socket, trimmedRoomId);
            console.log(`[VideoCall] ${uid} salió de la videollamada en ${trimmedRoomId}`);

            if (removed) {
                socket.to(trimmedRoomId).emit('user-left', { socketId: socket.id, uid });
            }
        });

        /**
         * Evento: Control de AV (US-13)
         * Se encarga de recibir cambios en el estado de la cámara y/o micrófono 
         * de un participante y sincronizar este estado con el resto de la sala.
         * 
         * @param {Object} payload - Datos del evento.
         * @param {string} payload.roomId - ID de la sala donde está el usuario.
         * @param {boolean} payload.audioMuted - Estado actual del micrófono.
         * @param {boolean} payload.videoMuted - Estado actual de la cámara.
         */
        // ── Evento: Control de AV (US-13) ───────────────────────────────────
        socket.on('toggle-av', (payload: { roomId: string; audioMuted: boolean; videoMuted: boolean }) => {
            try {
                if (!payload || !payload.roomId) return;
                const trimmedRoomId = payload.roomId.trim();

                const roomCall = activeVideoCalls.get(trimmedRoomId);
                if (roomCall && roomCall.has(uid)) {
                    const entry = roomCall.get(uid)!;
                    entry.audioMuted = payload.audioMuted;
                    entry.videoMuted = payload.videoMuted;
                }

                socket.to(trimmedRoomId).emit('av-state-changed', {
                    uid,
                    socketId: socket.id,
                    audioMuted: payload.audioMuted,
                    videoMuted: payload.videoMuted
                });
                console.log(`[VideoCall] AV Toggled by ${uid} en ${trimmedRoomId}: audioMuted=${payload.audioMuted}, videoMuted=${payload.videoMuted}`);
            } catch (error) {
                console.error('[VideoCall] Error en toggle-av:', error);
            }
        });

        /**
         * Evento: Compartir pantalla (US-14)
         * Se encarga de recibir cuando un participante empieza o termina de 
         * compartir su pantalla, y sincroniza este estado con los demás.
         * 
         * @param {Object} payload - Datos del evento.
         * @param {string} payload.roomId - ID de la sala.
         * @param {boolean} payload.isScreenSharing - Indica si está compartiendo pantalla o no.
         */
        // ── Evento: Compartir pantalla (US-14) ──────────────────────────────
        socket.on('toggle-screen-share', (payload: { roomId: string; isScreenSharing: boolean }) => {
            try {
                if (!payload || !payload.roomId) return;
                const trimmedRoomId = payload.roomId.trim();

                const roomCall = activeVideoCalls.get(trimmedRoomId);
                if (roomCall && roomCall.has(uid)) {
                    const entry = roomCall.get(uid)!;
                    entry.isScreenSharing = payload.isScreenSharing;
                }

                socket.to(trimmedRoomId).emit('screen-share-changed', {
                    uid,
                    socketId: socket.id,
                    isScreenSharing: payload.isScreenSharing
                });
                console.log(`[VideoCall] Screen Share Toggled by ${uid} en ${trimmedRoomId}: isScreenSharing=${payload.isScreenSharing}`);
            } catch (error) {
                console.error('[VideoCall] Error en toggle-screen-share:', error);
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
        // 'disconnecting' fires BEFORE the socket leaves its rooms,
        // so we can still broadcast to room members.
        socket.on('disconnecting', (reason: string) => {
            removeUserFromAllVideoCalls(io, socket);
            socket.rooms.forEach(room => {
                if (room !== socket.id) {
                    socket.to(room).emit('user-left', { socketId: socket.id, uid });
                }
            });
            console.log(`[Socket.IO] Cliente desconectado | id: ${socket.id} | razón: ${reason}`);
        });

        /**
         * Evento WebRTC: Offer (Oferta P2P)
         * Inicia el proceso de conexión P2P retransmitiendo una oferta de conexión
         * hacia un socket destino en específico.
         * 
         * @param {Object} payload - Datos de la oferta.
         * @param {string} payload.targetSocketId - El ID del socket del destinatario.
         * @param {any} payload.offer - Objeto RTCSessionDescriptionInit (offer).
         */
        // ── Evento: Offer ──────────────────────────────────────────────
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

        /**
         * Evento WebRTC: Answer (Respuesta P2P)
         * Responde a una oferta WebRTC retransmitiendo la respuesta hacia el socket original.
         * 
         * @param {Object} payload - Datos de la respuesta.
         * @param {string} payload.targetSocketId - El ID del socket que envió la oferta.
         * @param {any} payload.answer - Objeto RTCSessionDescriptionInit (answer).
         */
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

        /**
         * Evento WebRTC: ICE Candidate
         * Transmite candidatos ICE entre los clientes o pares (peers) 
         * para lograr establecer la ruta de conexión directa P2P.
         * 
         * @param {Object} payload - Datos del candidato.
         * @param {string} payload.targetSocketId - ID del socket destino.
         * @param {any} payload.candidate - Objeto RTCIceCandidate.
         */
        // ── Evento: ice-candidate ──────────────────────────────────────────────
        socket.on('ice-candidate', (payload: { targetSocketId: string, candidate: any}) => {
            try {
                if (!payload || !payload.targetSocketId || !payload.candidate) return;

                socket.to(payload.targetSocketId).emit('candidate', {
                    senderSocketId: socket.id,
                    candidate: payload.candidate
                });
                console.log(`[WebRTC] ICE Candidate: ${socket.id} -> ${payload.targetSocketId}`);
            } catch (error) {
                console.log(`[WebRTC] Error procesando ice-candidate`, error);
            }
        })
    });

    return io;
}
