import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';

// Extendemos la interfaz Request de Express para incluir al usuario autenticado
export interface AuthenticatedRequest extends Request {
    user?: {
        uid: string;
        email?: string | undefined;
        [key: string]: any;
    };
}

/**
 * Middleware que exige que la petición incluya un token de autenticación válido.
 * Soporta tokens JWT reales de Firebase y tokens mock en entorno de desarrollo.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Acceso denegado. Se requiere un token de autenticación (Bearer token).',
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Acceso denegado. Token inválido o mal estructurado.',
            });
        }

        // ─── Bypass de Desarrollo (Tokens Mock) ─────────────────────────────────
        // Si no estamos en producción y el token empieza con 'mock-', lo aceptamos
        if (process.env.NODE_ENV !== 'production' && token.startsWith('mock-')) {
            const mockUid = token.replace('mock-', '');
            req.user = {
                uid: mockUid,
                email: `${mockUid}@example.edu`,
                name: `Usuario Mock ${mockUid}`,
            };
            return next();
        }

        // ─── Validación Real con Firebase Auth ─────────────────────────────────
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            return next();
        } catch (firebaseError: any) {
            console.error('Error verificando ID Token de Firebase:', firebaseError.message);
            return res.status(401).json({
                success: false,
                message: 'Tu sesión ha expirado o el token es inválido. Por favor inicia sesión de nuevo.',
            });
        }
    } catch (error) {
        console.error('Error general en middleware de autenticación:', error);
        return res.status(500).json({
            success: false,
            message: 'Ocurrió un error interno al verificar tu autenticación.',
        });
    }
}
