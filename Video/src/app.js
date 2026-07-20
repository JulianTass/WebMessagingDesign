const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { getConfig, validateConfig } = require('./config');
const { errorHandler } = require('./middleware/errorHandler');
const { createMicrosoftAuthRouter } = require('./routes/microsoftAuth');
const { createZoomAuthRouter } = require('./routes/zoomAuth');
const { createScheduleRouter } = require('./routes/schedule');
const { createInvitationsRouter } = require('./routes/invitations');
const { createGenesysRouter } = require('./routes/genesysConfig');

function createApp(options = {}) {
  const config = options.config || getConfig();
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://sdk-cdn.mypurecloud.com', 'https://dhqbrvplips7x.cloudfront.net'],
        scriptSrcElem: ["'self'", 'https://sdk-cdn.mypurecloud.com', 'https://dhqbrvplips7x.cloudfront.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://dhqbrvplips7x.cloudfront.net'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://*.mypurecloud.com', 'https://*.pure.cloud', 'https://api.mypurecloud.com.au', 'https://login.mypurecloud.com.au'],
        frameSrc: ["'self'", 'https://genesys.zoom.us', 'https://*.zoom.us'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  }));

  app.use(express.json({ limit: '32kb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));

  app.use(session({
    name: 'seek.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/auth', createMicrosoftAuthRouter({ config }));
  app.use('/auth', createZoomAuthRouter({ config }));
  app.use('/api/schedule', createScheduleRouter({ config }));
  app.use('/api/invitations', createInvitationsRouter());
  app.use('/api/genesys', createGenesysRouter({ config }));

  app.use(errorHandler);

  return app;
}

function startServer() {
  const config = validateConfig(getConfig());
  const app = createApp({ config });
  app.listen(config.port, () => {
    console.log(`SEEK Meeting Scheduler running at ${config.baseUrl}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
