const oauthServer = require('koa2-oauth-server');
const router = require('koa-router');
const simpleMemoryStore = require('simple-memory-storage');
const consolidate = require('consolidate');
const path = require('path');

const userDb = require('../db/fake-user-db');
const oauthModel = require('../oauth-model/model');
const localFileClientRegistry = require('../oauth-model/client-registry');

const CSRF_TOKEN_EXPIRES_IN = 1000 * 60 * 2;// 2 minutes

const templateConfig = {
	'basePath': path.resolve(`${__dirname}/../views`),
	'ext': 'html',
	'engine': 'lodash'
};

module.exports = getOauthRouter;

function getOauthRouter(app, options={}){

	var oauthRouter = new router({ prefix: options.prefix });

	app.oauth = new oauthServer({
		model: oauthModel({
			//in this example, we use runtime-memory-backed storage for oauth codes and tokens. we can alternatively use redis or mongodb, etc.
			authorizationCodeStore: new simpleMemoryStore(),
			accessTokenStore: new simpleMemoryStore(),
			refreshTokenStore: new simpleMemoryStore(),
			clientRegistry: localFileClientRegistry
		}),
		useErrorHandler: true
	});

	// oauthRouter.get('/login', login);
	oauthRouter.post('/login', login);

	//check if the user has logged, if not, redirect to login page, otherwise redirect to the authorization confirm page
	oauthRouter.get('/authorize', checkLogin);

	//define the authorize endpoint, in this example, we implement only the most commonly used authorization type: authorization code
	oauthRouter.get('/authorize', app.oauth.authorize({
		//implement a handle(request, response):user method to get the authenticated user (aka. the logged-in user)
		//Note: this is where the node-oauth2-server get to know what the currently logined-in user is.
		authenticateHandler: authenticateHandler()
	}));

	//define the token endpoint, in this example, we implement two token grant types: 'code' and 'refresh_token'
	oauthRouter.post('/token', app.oauth.token());

	//error handler
	oauthRouter.all('/*', async (ctx, next) => {
		var oauthState = ctx.state.oauth || {};

        if(oauthState.error){
            //handle the error thrown by the oauth.authenticate middleware here
            ctx.throw(oauthState.error);
            return;
        }

		await next();
	});

	return oauthRouter;
}

function authenticateHandler(){
	return {
		handle: function(request, response){
			//in this example, we store the logged-in user as the 'loginUser' attribute in session
			if(request.session.loginUser){
				return { username: request.session.loginUser.username };
			}

			return null;
		}
	};
}

async function forwardToLogin(ctx, callbackUri){
	await forwardToView(ctx, 'login', {
		//when logged in successfully, redirect back to the original request url
		'callbackUri': Buffer.from(callbackUri, 'utf-8').toString('base64'),
		'loginUrl': '/oauth/login'
	});
}

async function forwardToView(ctx, viewName, viewModel){
	var viewPath = path.resolve(`${templateConfig.basePath}`, `${viewName}.${templateConfig.ext}`),
		renderer = consolidate[templateConfig.engine];

	if(!renderer){
		throw new Error(`template engine ${templateConfig.engine} is unsupported`);
	}

	ctx.body = await renderer(viewPath, viewModel);
}

function getRequestUrl(ctx){
	return `${ctx.href}`;
}

function removeUserAction(url){
	return url.replace(/&?(deny|agree|logout|csrfToken)=[^&]+/g, '');
}

/**
 * @param {Date} time
 * @return {Boolean}
 */
function isExpired(time){
	return Date.now() >= time;
}

async function checkLogin(ctx, next){
	var agree = ctx.query.agree == 'true',
		deny = ctx.query.deny == 'true', 
		logout = ctx.query.logout == 'true',
		clientId = ctx.query.client_id,
		{ csrfToken, scope } = ctx.query,
		loginUser = ctx.session.loginUser,
		sessCsrfToken = ctx.session.userConfirmCsrfToken,
		client, curRequestUrl, scopes;

	console.log('ctx.query || 用户中心判断当前用户状态 ==========================================\n ', ctx.query)
	if(!clientId || !scope){
		return ctx.status = 400;
	}

	//'localFileClientRegistry' as record data of source server 
	client = localFileClientRegistry.clients[clientId];
	//in this example, we simply filter out those scopes that are not valid
	scopes = scope.split(',').map(s => localFileClientRegistry.scopes[s]).filter(Boolean);

	if(!client){
		return ctx.status = 401;
	}

	curRequestUrl = removeUserAction(getRequestUrl(ctx));

	if(!loginUser){
		return await forwardToLogin(ctx, curRequestUrl);
	}

	if(csrfToken && sessCsrfToken && 
		sessCsrfToken.token == csrfToken && 
		!isExpired(sessCsrfToken.expiresAt) &&
		(agree || deny || logout)){
		if(deny){
			await forwardToView(ctx, 'user-denied', {
				'clientName': client.name,
				'username': loginUser.username
			});
		}else if(logout){
			ctx.session.loginUser = null;
			return await forwardToLogin(ctx, curRequestUrl);
		}else{//agree
			await next();
		}
		return;
	}

	sessCsrfToken = {
		'token': `csrf-${Math.floor(Math.random() * 100000000)}`,
		'expiresAt': Date.now() + CSRF_TOKEN_EXPIRES_IN
	};

	ctx.session.userConfirmCsrfToken = sessCsrfToken;

	await forwardToView(ctx, 'user-confirm', {
		'oauthUri': curRequestUrl,
		'csrfToken': sessCsrfToken.token,
		'clientName': client.name,
		'username': loginUser.username,
		'scopes': scopes
	});
}

async function login(ctx, next){
	var callbackUri = ctx.request.body.callback_uri,
		{ username, password } = ctx.request.body,
		user;

	console.log()
	if(!callbackUri || !username || !password){
		return ctx.status = 400;
	}

	callbackUri = Buffer.from(callbackUri, 'base64').toString('utf-8');

	console.log('callbackUri || To get code after login ===========================\n ', callbackUri)
	user = userDb.get(username);

	if(!user || user.password != password){
		console.log('Your accounts is mistake')
		await forwardToLogin(ctx, callbackUri);
		return;
	}

	//login successfully

	ctx.session.loginUser = { 'username': username };

	ctx.redirect(callbackUri);
}
