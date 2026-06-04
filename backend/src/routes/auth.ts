import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

const router = Router();

interface BasicUser { id: string; email: string; firstName: string; lastName: string; isSuperAdmin: boolean; }

function signToken(user: { id: string; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '7d' });
}

function publicUser(u: BasicUser) {
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, isSuperAdmin: u.isSuperAdmin };
}

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Identifiants invalides' });
    return;
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: 'email, password, firstName, lastName requis' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum)' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, firstName, lastName, phone: phone || null },
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Cet email est déjà utilisé' });
      return;
    }
    next(err);
  }
});

export default router;
