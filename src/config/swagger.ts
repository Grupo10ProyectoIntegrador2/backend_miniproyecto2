import swaggerJSDoc from "swagger-jsdoc";
import path from "path";

const serverUrl = process.env.SWAGGER_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://backend-miniproyecto2.onrender.com' 
    : 'http://localhost:3000');

const options: swaggerJSDoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'MiniProyecto 2- Api Documentation',
            version: '1.0.0',
            description: 'Endpoint documentation for Miniproyecto 2',
        },
        servers: [
            {
                url: serverUrl,
                description: process.env.NODE_ENV === 'production' ? 'Production' : 'Development',
            },
        ],
    },
    apis: [
        path.join(__dirname, '../routes/*.js'),
        path.join(__dirname, '../routes/*.ts'),
    ],
};

export const swaggerSpec = swaggerJSDoc(options);