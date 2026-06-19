import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';

export interface AuthUser {
    uid: string;
    email?: string | undefined;
    name?: string | undefined;
    [key: string]: unknown;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}

export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
    if (!token) {
        return null;
    }

    if (process.env.NODE_ENV === 'development' && token.startsWith('mock-')) {
        const mockUid = token.replace('mock-', '');
        return {
            uid: mockUid,
            email: `${mockUid}@example.edu`,
            name: `Usuario Mock ${mockUid}`,
        };
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        return {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name as string | undefined,
        };
    } catch (firebaseError: unknown) {
        const message = firebaseError instanceof Error ? firebaseError.message : 'Token inválido';
        console.error('Error verificando ID Token de Firebase:', message);
        return null;
    }
}

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

        const user = await verifyAuthToken(token);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Tu sesión ha expirado o el token es inválido. Por favor inicia sesión de nuevo.',
            });
        }

        req.user = user;
        return next();
    } catch (error) {
        console.error('Error general en middleware de autenticación:', error);
        return res.status(500).json({
            success: false,
            message: 'Ocurrió un error interno al verificar tu autenticación.',
        });
    }
}
