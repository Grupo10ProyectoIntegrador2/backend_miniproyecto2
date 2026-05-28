import { Router } from 'express';
import type { Request, Response } from 'express';
import { checkUsernameExists, checkEmailExists, saveUserProfile, getUserProfile } from '../services/validation.service';

const router = Router();

// POST /auth/check-username
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


//POST /auth/check-email
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


//POST /auth/register , guarda el perfil en firestore
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


//POST /auth/login 
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



export default router;