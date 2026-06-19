import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import authRoutes from './routes/auth.routes';
import roomsRoutes from './routes/rooms.routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { initSocket } from './config/socket';
import { allowedOrigins } from './config/cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'Backend running' });
});

app.use('/auth', authRoutes);
app.use('/rooms', roomsRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    console.log(`[Socket.IO] Esperando conexiones en puerto ${PORT}`);
});
