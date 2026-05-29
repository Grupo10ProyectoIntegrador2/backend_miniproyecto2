import { Router } from 'express';
import type { Request, Response } from 'express';
import { checkUsernameExists, checkEmailExists, saveUserProfile, getUserProfile } from '../services/validation.service';

const router = Router();

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
 *             required:
 *               - username
 *             properties:
 *               username:
 *                 type: string
 *                 description: Nombre de usuario a verificar
 *     responses:
 *       200:
 *         description: Resultado de disponibilidad del username
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Username requerido
 *       500:
 *         description: Error del servidor
 */
router.post('/check-username', async (req: Request, res: Response) => {
    try {
        const { username } = req.body;

        if (!username || username.trim().length === 0) {
            return res.status(400).json({
                available: false,
                message: 'Username is required',
            });
        }

        const exists = await checkUsernameExists(username);

        res.json({
            available: !exists,
            message: exists ? 'Username already taken' : 'Username available',
        });
    } catch (error) {
        console.error('Error checking username:', error);
        res.status(500).json({
            available: false,
            message: 'Error checking username availability',
        });
    }
});


/**
 * @swagger
 * /auth/check-email:
 *   post:
 *     summary: Verifica si un correo electrónico está registrado
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Correo electrónico a verificar
 *     responses:
 *       200:
 *         description: Resultado de disponibilidad del email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Email requerido
 *       500:
 *         description: Error del servidor
 */
router.post('/check-email', async (req: Request, res: Response) => {
    try {
        const {email} = req.body;

        if (!email || email.trim().length === 0) {
            return res.status(400).json({
                available: false,
                message: 'Email is required',
            });
        }

        const exists = await checkEmailExists(email);

        res.json({
            available: !exists,
            message: exists ? 'Email already registered' : 'Email available',
        });
    } catch (error) {
        console.error('Error checking email:', error);
        res.status(500).json({
            available: false,
            message: 'Error checking email availability',
        });
    }
});


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
 *             required:
 *               - uid
 *               - firstName
 *               - lastName
 *               - username
 *               - email
 *               - provider
 *             properties:
 *               uid:
 *                 type: string
 *                 description: ID único de Firebase
 *               firstName:
 *                 type: string
 *                 description: Nombre del usuario
 *               lastName:
 *                 type: string
 *                 description: Apellido del usuario
 *               username:
 *                 type: string
 *                 description: Nombre de usuario único
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Correo electrónico
 *               avatarUrl:
 *                 type: string
 *                 description: URL de la foto de perfil (opcional)
 *               provider:
 *                 type: string
 *                 enum: [email, google]
 *                 description: Proveedor de autenticación
 *     responses:
 *       200:
 *         description: Usuario registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Campos faltantes o datos duplicados
 *       500:
 *         description: Error del servidor
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { uid, firstName, lastName, username, email, avatarUrl, provider } = req.body;

        if (!uid || !firstName || !lastName || !username || !email || !provider) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields',
            });
        }

        const usernameExists = await checkUsernameExists(username);
        const emailExists = await checkEmailExists(email);

        if (usernameExists) {
            return res.status(400).json({
                success: false,
                message: 'Username already taken',
            });
        }

        if (emailExists) {
            return res.status(400).json({
                success: false,
                message: 'Email already taken',
            });
        }

        await saveUserProfile(uid, {
            firstName,
            lastName,
            username,
            email,
            avatarUrl: avatarUrl || '',
            provider,
        });

        res.json({
            success: true,
            message: 'User registered successfully',
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering user',
        });
    }
});


/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Inicia sesión de un usuario y retorna su perfil
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uid
 *             properties:
 *               uid:
 *                 type: string
 *                 description: ID único de Firebase del usuario
 *     responses:
 *       200:
 *         description: Usuario autenticado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: UID requerido
 *       500:
 *         description: Error del servidor
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { uid } = req.body;

        if(!uid) {
            return res.status(400).json({
                success: false,
                message: 'UID is required',
            });
        }

        const userProfile = await getUserProfile(uid);
        
        // Si es null, es un usuario nuevo; si existe, es un usuario conocido
        res.json({
            success: true,
            user: userProfile,
        });
    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving user profile',
        });
    }
});


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
 *             required:
 *               - uid
 *               - username
 *               - firstName
 *               - lastName
 *               - email
 *             properties:
 *               uid:
 *                 type: string
 *                 description: ID único de Firebase
 *               username:
 *                 type: string
 *                 description: Nombre de usuario único
 *               firstName:
 *                 type: string
 *                 description: Nombre del usuario
 *               lastName:
 *                 type: string
 *                 description: Apellido del usuario
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Correo electrónico
 *               avatarUrl:
 *                 type: string
 *                 description: URL de la foto de perfil (opcional)
 *     responses:
 *       200:
 *         description: Perfil completado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Campos faltantes o username duplicado
 *       500:
 *         description: Error del servidor
 */
router.post('/complete-profile', async (req: Request, res: Response) => {
  try {
    const { uid, username, firstName, lastName, email, avatarUrl } = req.body;

    if (!uid || !username || !firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const usernameExists = await checkUsernameExists(username);
    if (usernameExists) {
      return res.status(400).json({
        success: false,
        message: 'Username already taken',
      });
    }

    await saveUserProfile(uid, {
      firstName,
      lastName,
      username,
      email,
      avatarUrl: avatarUrl || '',
      provider: 'google',
    });

    res.json({
      success: true,
      message: 'Profile completed successfully',
    });
  } catch (error) {
    console.error('Error completing profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing profile',
    });
  }
});

export default router;