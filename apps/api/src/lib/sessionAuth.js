/**
 * Establish an authenticated session after a privilege transition (login,
 * signup, invite-accept). Rotates the session id via regenerate() so any sid
 * seeded into the browser before login is invalidated (OWASP session-fixation
 * fix). PLAN.md §11.
 */
export function loginUserSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}
