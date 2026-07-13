/**
 * Auth routes — /api/v1/auth/* (PLAN.md §7.1). Thin: validate -> service.
 */
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { z } from 'zod';
import { loginUserSession } from '../../lib/sessionAuth.js';
import { authLimiter, passwordResetLimiter } from '../../middleware/rateLimit.js';
import {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@flotilla/shared';
import * as authService from './service.js';

export const router = Router();

router.post(
  '/signup',
  authLimiter,
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const { user, workspace } = await authService.signUp(req.body);
    await loginUserSession(req, user.id);
    res.status(201).json({
      user: authService.toPublicUser(user),
      workspace: workspace
        ? { id: workspace.id, slug: workspace.slug, name: workspace.name }
        : null,
    });
  }),
);

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.logIn(req.body);
    await loginUserSession(req, user.id);
    res.json({ user: authService.toPublicUser(user) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logOut(req);
    res.clearCookie('flotilla.sid');
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { user, workspaces } = await authService.getMe(req.userId);
    res.json({
      user: authService.toPublicUser(user),
      workspaces: workspaces.map((w) => ({
        id: w.id,
        slug: w.slug,
        name: w.name,
        plan: w.plan,
      })),
    });
  }),
);

router.patch(
  '/me',
  requireAuth,
  validateBody(
    z.object({
      name: z.string().trim().min(1).max(100).optional(),
      avatarUrl: z.string().url().nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const user = await authService.updateProfile(req.userId, req.body);
    res.json({ user: authService.toPublicUser(user) });
  }),
);

router.post(
  '/verify-email',
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    await authService.verifyEmail(req.body.token);
    res.json({ ok: true });
  }),
);

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    res.json({ ok: true }); // always ok — never leak account existence
  }),
);

router.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ ok: true });
  }),
);

// Re-export for potential composition.
export { optionalAuth };
