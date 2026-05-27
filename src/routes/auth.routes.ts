import { Router } from 'express';
import type { Request, Response } from 'express';
import { checkUsernameExists, checkEmailExists } from '../services/validation.service';

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


export default router;