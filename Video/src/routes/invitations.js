const express = require('express');
const { getInvitation } = require('../services/invitationStore');

function createInvitationsRouter() {
  const router = express.Router();

  router.get('/:id/download', (req, res, next) => {
    try {
      const entry = getInvitation(req.params.id);
      if (!entry) {
        const err = new Error('Invitation not found or expired.');
        err.code = 'INVITATION_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="seek-meeting.ics"');
      res.send(entry.icsContent);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createInvitationsRouter };
