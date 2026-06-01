import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import roomsRoutes from './routes/rooms.routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// los middlewares
app.use(cors());
app.use(express.json());

// ruta de prueba
app.get('/health', (req, res) => {
    res.json({ status: 'Backend runnig meloo' });
});

app.use('/auth', authRoutes);
app.use('/rooms', roomsRoutes);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
