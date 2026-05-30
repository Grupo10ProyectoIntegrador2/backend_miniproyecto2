import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// los middlewares
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? 'https://tu-frontend.vercel.app'  // Reemplaza con tu URL del frontend
        : 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());

// ruta de prueba
app.get('/health', (req, res) => {
    res.json({ status: 'Backend runnig meloo' });
});

app.use('/auth', authRoutes);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
