import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';


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

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
