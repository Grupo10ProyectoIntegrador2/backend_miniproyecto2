import { Router } from 'express';
import type { Router as ExpressRouter, Request, Response } from 'express';
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

const router: ExpressRouter = Router();

function userError(res: Response, status: number, message: string) {
    return res.status(status).json({ success: false, message });
}

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

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registra un nuevo usuario con email y contraseña (Requiere Autenticación)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, username, email, provider]
 *             properties:
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
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.post('/register', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const uid = req.user!.uid;
        const { firstName, lastName, username, email, avatarUrl, provider } = req.body;

        if (!firstName || !lastName || !username || !email || !provider) {
            return userError(res, 400, 'Faltan datos obligatorios para completar el registro.');
        }

        if (provider !== 'email' && provider !== 'google') {
            return userError(res, 400, 'El proveedor de autenticación no es válido.');
        }

        const existingProfile = await getUserProfile(uid);
        if (existingProfile) {
            return userError(res, 400, 'Ya existe un perfil registrado para este usuario.');
        }

        const namesValidation = validateNames(firstName, lastName);
        if (!namesValidation.valid) {
            return userError(res, 400, namesValidation.error!);
        }

        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            return userError(res, 400, usernameValidation.error!);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return userError(res, 400, emailValidation.error!);
        }

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

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Inicia sesión y retorna el perfil del usuario (Requiere Autenticación)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario (o null si no existe)
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.post('/login', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const uid = req.user!.uid;
        const { avatarUrl } = req.body;

        const userProfile = await getUserProfile(uid);

        if (userProfile && avatarUrl && avatarUrl.trim() !== '') {
            if (userProfile.avatarUrl !== avatarUrl) {
                await updateUserProfile(uid, { avatarUrl });
                userProfile.avatarUrl = avatarUrl;
            }
        }

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

/**
 * @swagger
 * /auth/complete-profile:
 *   post:
 *     summary: Completa el perfil de un usuario tras registrarse con Google (Requiere Autenticación)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, firstName, lastName, email]
 *             properties:
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
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.post('/complete-profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const uid = req.user!.uid;
        const { username, firstName, lastName, email, avatarUrl } = req.body;

        if (!username || !firstName || !lastName || !email) {
            return userError(res, 400, 'Faltan datos obligatorios para completar tu perfil.');
        }

        const existingProfile = await getUserProfile(uid);
        if (existingProfile) {
            return userError(res, 400, 'Ya existe un perfil registrado para este usuario.');
        }

        const namesValidation = validateNames(firstName, lastName);
        if (!namesValidation.valid) {
            return userError(res, 400, namesValidation.error!);
        }

        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            return userError(res, 400, usernameValidation.error!);
        }

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return userError(res, 400, emailValidation.error!);
        }

        const usernameExists = await checkUsernameExists(username);
        if (usernameExists) {
            return userError(res, 400, 'Ese nombre de usuario ya está en uso. Por favor elige otro.');
        }

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

        if (req.user!.uid !== uid) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para modificar este perfil.',
            });
        }

        const existing = await getUserProfile(uid);
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: 'No encontramos ningún perfil para actualizar.',
            });
        }

        if (email !== undefined && existing.provider === 'google') {
            return userError(res, 400, 'El correo electrónico no se puede modificar para cuentas de Google.');
        }

        if (email !== undefined && email.toLowerCase() !== existing.email) {
            const emailValidation = validateEmail(email);
            if (!emailValidation.valid) {
                return userError(res, 400, emailValidation.error!);
            }

            const emailExists = await checkEmailExists(email);
            if (emailExists) {
                return userError(res, 400, 'Ese correo ya está registrado. Por favor elige otro.');
            }
        }

        if (firstName !== undefined || lastName !== undefined) {
            const namesValidation = validateNames(
                firstName ?? existing.firstName,
                lastName ?? existing.lastName
            );
            if (!namesValidation.valid) {
                return userError(res, 400, namesValidation.error!);
            }
        }

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

        await updateUserProfile(uid, { firstName, lastName, username, avatarUrl, email });

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

        if (req.user!.uid !== uid) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para eliminar esta cuenta.',
            });
        }

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