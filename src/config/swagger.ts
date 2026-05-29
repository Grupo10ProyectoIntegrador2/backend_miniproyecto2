import swaggerJSDoc from "swagger-jsdoc";
import path from "path";

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
                url: 'http://localhost:3000',
                description: 'Development server',
            },
        ],
    },
    apis: [path.join(__dirname, '../routes/*.ts')],
};

export const swaggerSpec = swaggerJSDoc(options);