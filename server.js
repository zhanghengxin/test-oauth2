const koa = require('koa');
const bodyParser = require('koa-bodyparser');
const session = require('koa-session');

const oauthRouter = require('./routers/oauth-router');
const apiRouter = require('./routers/api-router');

const app = new koa();

app.keys = [ 'some-keys-to-sign-cookies-by-koa-session' ];

app.use(bodyParser());
app.use(session(app));
app.use(async (ctx, next) => {
    //needed by authenticateHandler, see oauth-router
    ctx.request.session = ctx.session;
    await next();
});

app.use(oauthRouter(app, { 'prefix': '/oauth' }).routes());
app.use(apiRouter(app, { prefix: '/api' }).routes());

app.listen(3002, function(){
    console.log('oauth server listening on port 3002');
});
