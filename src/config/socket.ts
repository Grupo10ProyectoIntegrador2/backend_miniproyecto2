import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';

export function initSocket(httpServer: HttpServer): Server {
    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket: Socket) => {
        console.log(`[Socket.IO] Cliente conectado    | id: ${socket.id}`);

        // ── Evento: unirse a una sala ────────────────────────────────────────
        socket.on('join-room', (payload: { roomId: string; participant?: unknown } | string) => {
            const roomId = typeof payload === 'string' ? payload : payload.roomId;
            const participant = typeof payload === 'string' ? undefined : payload.participant;

            if (!roomId) {
                return;
            }

            socket.join(roomId);
            console.log(`[Socket.IO] Socket ${socket.id} se unió a la sala: ${roomId}`);
            io.to(roomId).emit('user-joined', { roomId, participant, socketId: socket.id });
        });

        // ── Evento: salir de una sala ────────────────────────────────────────
        socket.on('leave-room', (roomId: string) => {
            socket.leave(roomId);
            console.log(`[Socket.IO] Socket ${socket.id} salió de la sala: ${roomId}`);
            socket.to(roomId).emit('user-left', { socketId: socket.id });
        });

        // ── Evento: desconexión ──────────────────────────────────────────────
        socket.on('disconnect', (reason: string) => {
            console.log(`[Socket.IO] Cliente desconectado | id: ${socket.id} | razón: ${reason}`);
        });
    });

    return io;
}
