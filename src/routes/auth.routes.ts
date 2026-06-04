import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
    checkUsernameExists,
    checkEmailExists,
    saveUserProfile,
    getUserProfile,
    updateUserProfile,
    deleteUserProfile,
    validateUsername,
    validateEmail,
    validateNames,
    getAvatarUrl,
} from '../services/validation.service';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Responde con un error amigable (nunca expone detalles técnicos). */
function userError(res: Response, status: number, message: string) {
    return res.status(status).json({ success: false, message });
}


// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/check-username
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/check-username:
 *   post:
 *     summary: Verifica si un nombre de usuario está disponible
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: Resultado de disponibilidad
 *       400:
 *         description: Username requerido o inválido
 *       500:
 *         description: Error del servidor
 */
router.post('/check-username', async (req: Request, res: Response) => {
    try {
        const { username } = req.body;

        if (!username || username.trim().length === 0) {
            return userError(res, 400, 'El nombre de usuario es obligatorio.');
        }

        const validation = validateUsername(username);
        if (!validation.valid) {
            return res.status(400).json({ available: false, message: validation.error });
        }

        const exists = await checkUsernameExists(username);

        res.json({
            available: !exists,
            message: exists
                ? 'Ese nombre de usuario ya está en uso. Elige otro.'
                : 'El nombre de usuario está disponible.',
        });
    } catch (error) {
        console.error('Error verificando username:', error);
        res.status(500).json({
            available: false,
            message: 'No pudimos verificar el nombre de usuario en este momento. Intenta de nuevo.',
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/check-email
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/check-email:
 *   post:
 *     summary: Verifica si un correo electrónico ya está registrado
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Resultado de disponibilidad
 *       400:
 *         description: Email requerido o inválido
 *       500:
 *         description: Error del servidor
 */
router.post('/check-email', async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email || email.trim().length === 0) {
            return userError(res, 400, 'El correo electrónico es obligatorio.');
        }

        const validation = validateEmail(email);
        if (!validation.valid) {
            return res.status(400).json({ available: false, message: validation.error });
        }

        const exists = await checkEmailExists(email);

        res.json({
            available: !exists,
            message: exists
                ? 'Ese correo ya está registrado. ¿Ya tienes cuenta? Inicia sesión.'
                : 'El correo está disponible.',
        });
    } catch (error) {
        console.error('Error verificando email:', error);
        res.status(500).json({
            available: false,
            message: 'No pudimos verificar el correo en este momento. Intenta de nuevo.',
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registra un nuevo usuario con email y contraseña
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uid, firstName, lastName, username, email, provider]
 *             properties:
 *               uid:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               avatarUrl:
 *                 type: string
 *                 description: URL de foto (opcional). Si se omite se genera desde Gravatar.
 *               provider:
 *                 type: string
 *                 enum: [email, google]
 *     responses:
 *       200:
 *         description: Usuario registrado exitosamente
 *       400:
 *         description: Datos inválidos o duplicados
 *       500:
 *         description: Error del servidor
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { uid, firstName, lastName, username, email, avatarUrl, provider } = req.body;

        // Campos obligatorios
        if (!uid || !firstName || !lastName || !username || !email || !provider) {
            return userError(res, 400, 'Faltan datos obligatorios para completar el registro.');
        }

        // Validar nombres
        const namesValidation = validateNames(firstName, lastName);
        if (!namesValidation.valid) {
            return userError(res, 400, namesValidation.error!);
        }

        // Validar username
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            return userError(res, 400, usernameValidation.error!);
        }

        // Validar email (incluye restricción .edu)
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return userError(res, 400, emailValidation.error!);
        }

        // Verificar duplicados
        const [usernameExists, emailExists] = await Promise.all([
            checkUsernameExists(username),
            checkEmailExists(email),
        ]);

        if (usernameExists) {
            return userError(res, 400, 'Ese nombre de usuario ya está en uso. Por favor elige otro.');
        }

        if (emailExists) {
            return userError(res, 400, 'Ese correo ya está registrado. ¿Ya tienes cuenta? Inicia sesión.');
        }

        // Avatar: si el frontend no envía uno, generarlo con Gravatar a partir del email
        const resolvedAvatarUrl = avatarUrl && avatarUrl.trim() !== ''
            ? avatarUrl
            : getAvatarUrl(email);

        await saveUserProfile(uid, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            username,
            email,
            avatarUrl: resolvedAvatarUrl,
            provider,
        });

        res.json({
            success: true,
            message: '¡Registro exitoso! Bienvenido a la plataforma.',
        });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            success: false,
            message: 'Ocurrió un problema al crear tu cuenta. Intenta de nuevo más tarde.',
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Inicia sesión y retorna el perfil del usuario
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uid]
 *             properties:
 *               uid:
 *                 type: string
 *     responses:
 *       200:
 *         description: Perfil del usuario (o null si no existe)
 *       400:
 *         description: UID requerido
 *       500:
 *         description: Error del servidor
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { uid } = req.body;

        if (!uid) {
            return userError(res, 400, 'No se recibió la información de sesión. Intenta iniciar sesión de nuevo.');
        }

        const userProfile = await getUserProfile(uid);

        res.json({
            success: true,
            user: userProfile,
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Ocurrió un problema al iniciar sesión. Intenta de nuevo más tarde.',
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/complete-profile  (registro Google → completar username)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/complete-profile:
 *   post:
 *     summary: Completa el perfil de un usuario tras registrarse con Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uid, username, firstName, lastName, email]
 *             properties:
 *               uid:
 *                 type: string
 *               username:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               avatarUrl:
 *                 type: string
 *                 description: URL de la foto de Google (photoURL). Si se omite se usa Gravatar.
 *     responses:
 *       200:
 *         description: Perfil completado exitosamente
 *       400:
 *         description: Datos inválidos o username duplicado
 *       500:
 *         description: Error del servidor
 */
router.post('/complete-profile', async (req: Request, res: Response) => {
    try {
        const { uid, username, firstName, lastName, email, avatarUrl } = req.body;

        if (!uid || !username || !firstName || !lastName || !email) {
            return userError(res, 400, 'Faltan datos obligatorios para completar tu perfil.');
        }

        // Validar nombres
        const namesValidation = validateNames(firstName, lastName);
        if (!namesValidation.valid) {
            return userError(res, 400, namesValidation.error!);
        }

        // Validar username
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            return userError(res, 400, usernameValidation.error!);
        }

        // Validar email (incluye restricción .edu)
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return userError(res, 400, emailValidation.error!);
        }

        const usernameExists = await checkUsernameExists(username);
        if (usernameExists) {
            return userError(res, 400, 'Ese nombre de usuario ya está en uso. Por favor elige otro.');
        }

        // Avatar: preferir la foto de Google; si no viene, usar Gravatar
        const resolvedAvatarUrl = avatarUrl && avatarUrl.trim() !== ''
            ? avatarUrl
            : getAvatarUrl(email);

        await saveUserProfile(uid, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            username,
            email,
            avatarUrl: resolvedAvatarUrl,
            provider: 'google',
        });

        res.json({
            success: true,
            message: '¡Perfil completado! Ya puedes empezar a usar la plataforma.',
        });
    } catch (error) {
        console.error('Error completando perfil:', error);
        res.status(500).json({
            success: false,
            message: 'Ocurrió un problema al guardar tu perfil. Intenta de nuevo más tarde.',
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/profile/:uid   – Ver perfil
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/profile/{uid}:
 *   get:
 *     summary: Obtiene el perfil de un usuario por UID
 *     tags: [Perfil]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *         description: UID de Firebase del usuario
 *     responses:
 *       200:
 *         description: Perfil del usuario
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/profile/:uid', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const uid = req.params['uid'] as string;

        const profile = await getUserProfile(uid);

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: 'No encontramos ningún perfil asociado a esta cuenta.',
            });
        }

        res.json({ success: true, user: profile });
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({
            success: false,
            message: 'No pudimos cargar el perfil en este momento. Intenta de nuevo más tarde.',
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// PUT /auth/profile/:uid   – Editar perfil
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/profile/{uid}:
 *   put:
 *     summary: Actualiza el perfil de un usuario
 *     tags: [Perfil]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               username:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.put('/profile/:uid', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const uid = req.params['uid'] as string;
        const { firstName, lastName, username, avatarUrl, email } = req.body;

        // Control de acceso: solo el dueño del perfil puede modificarlo
        if (req.user!.uid !== uid) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para modificar este perfil.',
            });
        }

        // El correo electrónico no se puede cambiar
        if (email !== undefined) {
            return userError(res, 400, 'El correo electrónico no se puede modificar.');
        }

        // Verificar que el perfil existe
        const existing = await getUserProfile(uid);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'No encontramos ningún perfil para actualizar.',
            });
        }


        // Validar nombres si se envían
        if (firstName !== undefined || lastName !== undefined) {
            const namesValidation = validateNames(
                firstName ?? existing.firstName,
                lastName  ?? existing.lastName
            );
            if (!namesValidation.valid) {
                return userError(res, 400, namesValidation.error!);
            }
        }

        // Validar y verificar disponibilidad del username si cambió
        if (username !== undefined && username.toLowerCase() !== existing.username) {
            const usernameValidation = validateUsername(username);
            if (!usernameValidation.valid) {
                return userError(res, 400, usernameValidation.error!);
            }

            const usernameExists = await checkUsernameExists(username);
            if (usernameExists) {
                return userError(res, 400, 'Ese nombre de usuario ya está en uso. Por favor elige otro.');
            }
        }

        await updateUserProfile(uid, { firstName, lastName, username, avatarUrl });

        res.json({
            success: true,
            message: 'Tu perfil se actualizó correctamente.',
        });
    } catch (error) {
        console.error('Error actualizando perfil:', error);
        res.status(500).json({
            success: false,
            message: 'Ocurrió un problema al actualizar tu perfil. Intenta de nuevo más tarde.',
        });
    }
});


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /auth/profile/:uid   – Eliminar cuenta
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /auth/profile/{uid}:
 *   delete:
 *     summary: Elimina la cuenta de un usuario (Firestore + Firebase Auth)
 *     tags: [Perfil]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cuenta eliminada exitosamente
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete('/profile/:uid', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const uid = req.params['uid'] as string;

        // Control de acceso: solo el dueño de la cuenta puede eliminarla
        if (req.user!.uid !== uid) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para eliminar esta cuenta.',
            });
        }

        // Verificar que el perfil existe antes de eliminar
        const existing = await getUserProfile(uid);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'No encontramos ninguna cuenta asociada a este usuario.',
            });
        }

        await deleteUserProfile(uid);

        res.json({
            success: true,
            message: 'Tu cuenta ha sido eliminada exitosamente.',
        });
    } catch (error) {
        console.error('Error eliminando cuenta:', error);
        res.status(500).json({
            success: false,
            message: 'Ocurrió un problema al eliminar tu cuenta. Intenta de nuevo más tarde.',
        });
    }
});


export default router;