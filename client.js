const koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const session = require('koa-session');
const path = require('path');
const consolidate = require('consolidate');

const httpUtils = require('./utils/http-utils');

const oauthRouter = require('./routers/oauth-router');
const apiRouter = require('./routers/api-router');

const app = new koa();
const router = new Router();

const OAUTH_STATE_EXPIRES_IN = 1000 * 60 * 5;// 5 minutes

const oauthServerInfo = {
    endpoint: {
        'authorize': 'http://localhost:3002/oauth/authorize',
        'token': 'http://localhost:3002/oauth/token'
    },
    api: {
        'getUserInfo': 'http://localhost:3002/api/user/detail'
    }
};

//these information should match those in the oauth server's client registry
const oauthClientInfo = {
	'id': 'sample_app',
	'clientSecret': 'this_is_the_client_secret',
	'name': 'Sample App',
	'scope': 'user_info:read',
    'responseType': 'code',
    'grantType': 'authorization_code',
	'redirectUri': 'http://localhost:3001/receiveGrant'
};

const templateConfig = {
    'basePath': path.resolve(`${__dirname}/client-views`),  
    'ext': 'html',
    'engine': 'lodash'
};

app.keys = [ 'some-keys-to-sign-cookies-by-koa-session' ];

router.get('/sample_app', async (ctx, next) => {
    await forwardToView(ctx, 'sample_app', {});
});

router.get('/revoke', async (ctx, next) => {
    ctx.session.token = null;
    ctx.body = {
        'success': true
    };
});

router.get('/getUserInfo', async (ctx, next) => {
    var token = ctx.session.token,
        refresh = false,
        resp;

    // 当token 没有过期
    if(token && !isExpired(token.expiresAt)){
        try{
            resp = await httpUtils.getWithToken(oauthServerInfo.api.getUserInfo, {
                token: token.accessToken,
                type: token.tokenType
            });
            if(resp.response.statusCode === 200){
                return ctx.body = resp.body;
            }else if(resp.response.statusCode === 401){
		//maybe the access token expired, try to use the refresh token to get a new one
                refresh = true;
            }else{
                throw new Error(`error-code:${resp.response.statusCode}`);
            }
        }catch(e){

            return ctx.body = { error: e };
        }
    }

    // token 不存在，跳转Authorize 页面获取认证
    if(!token){
        console.log('token 不存在，去Authorize 页面获取认证')
        return redirectToAuthorize(ctx);
    }

    // refresh 刷新令牌不存在 报错。
    if(!refresh){
        return ctx.body = { error: 'unknown error' };
    }

    token = await refreshToken(token);

    if(token){
        ctx.session.token = token;
        //refresh success, try again
        ctx.redirect(`${ctx.href}`);
    }else{
        //fail to refresh, maybe the refresh token itself expired
        ctx.session.token = null;
        return redirectToAuthorize(ctx);
    }
    
});

//endpoint to receive authorization code
//Note: the oauth server do not directly call this endpoint, instead, it ask the user agent (browser) to redirect here
router.get('/receiveGrant', async (ctx, next) => {
    var { code, state } = ctx.query,
        oauthState = ctx.session.oauthState,
        resp;
    console.log('In the receiveGrant')
    console.log('code || code 换取 token  ========================================= ', code)
    console.log('state                    ========================================= ', state)
    console.log('oauthState               ========================================= ', oauthState)
    console.log('oauthState.expiresAt     ===================data================== ', oauthState.expiresAt)
    if(code && state && oauthState && 
        oauthState.state == state &&
        !isExpired(oauthState.expiresAt)){
        //confirm that this request is valid (not forged)
        //use the code to request for an access token
        //http://localhost:3002/oauth/token
        try{
            resp = await httpUtils.postForm(oauthServerInfo.endpoint.token, {
                'grant_type': oauthClientInfo.grantType,
                'client_id': oauthClientInfo.id,
                'client_secret': oauthClientInfo.clientSecret,
                'code': code,
                'scope': oauthClientInfo.scope,
                'redirect_uri': oauthClientInfo.redirectUri
            });

            if(resp.response.statusCode !== 200){
                throw new Error(`error-code: ${resp.response.statusCode}`);
            }

            console.log('successed code as token   =====================成功==================== ')
            // console.log('get the ctx ========================================================== \n', ctx)

            //in the example, we will save token information in session
            //in production environment, you may need them stored in persistent storage like a database
            ctx.session.token = {
                'accessToken': resp.body.access_token,
                'refreshToken': resp.body.refresh_token,
                'tokenType': resp.body.token_type,
                'expiresAt': Date.now() + resp.body.expires_in * 1000//when the access token will expire
            };
            console.log('get the ctx ========================================================== \n', ctx)

            return await forwardToView(ctx, 'oauth-success', {});
        }catch(e){
            //maybe the code expired
            console.error(e);
            //ask user to authorize again
        }
    }

    redirectToAuthorize(ctx);
});

async function refreshToken(token){
    var resp;
    console.log('on the refreshToken mode:')
    console.log('token \n ||||||||||||||||||||||||||||||| ', token)
    try{
        resp = await httpUtils.postForm(oauthServerInfo.endpoint.token, {
            'grant_type': 'refresh_token',
            'client_id': oauthClientInfo.id,
            'client_secret': oauthClientInfo.clientSecret,
            'refresh_token': token.refreshToken,
            'scope': oauthClientInfo.scope,
            'redirect_uri': oauthClientInfo.redirectUri
        });

        if(resp.response.statusCode !== 200){
            return false;
        }
        if(!resp.body.access_token){
            throw new Error(`unkown error, no access_token in response`);
        }

        //in the example, we will save token information in session
        //in production environment, you may need them stored in persistent storage like a database
        token = {
            'accessToken': resp.body.access_token,
            'refreshToken': resp.body.refresh_token,
            'tokenType': resp.body.token_type,
            'expiresAt': Date.now() + resp.body.expires_in * 1000//when the access token will expire
        };

        console.log('\t successfully refresh')
        return token;
    }catch(e){
        console.error('\t failed to refresh');
        console.error(e);
        return false;
    }
}

// using render show user's view
async function forwardToView(ctx, viewName, viewModel){
	var viewPath = path.resolve(`${templateConfig.basePath}`, `${viewName}.${templateConfig.ext}`),
		renderer = consolidate[templateConfig.engine];

	if(!renderer){
		throw new Error(`template engine ${templateConfig.engine} is unsupported`);
	}

	ctx.body = await renderer(viewPath, viewModel);
}

function redirectToAuthorize(ctx){
    var oauthState = {
        state: `os-${Math.floor(Math.random() * 100000000)}`,
        expiresAt: Date.now() + OAUTH_STATE_EXPIRES_IN
    };

    ctx.session.oauthState = oauthState;

    console.log('访问 ------ http://localhost:3002/oauth/authorize')
    redirect(ctx, oauthServerInfo.endpoint.authorize, {
        'response_type': oauthClientInfo.responseType,
        'client_id': oauthClientInfo.id,
        'scope': oauthClientInfo.scope,
        'redirect_uri': oauthClientInfo.redirectUri,
        'state': oauthState.state
    });    
}

function isExpired(time){
    return Date.now() > time;
}

function redirect(ctx, uri, query = {}){
    ctx.redirect(composeUri(uri, query));
}

function composeUri(uri, query){
    var f, s, arr;

    arr = [];

    for(f in query){
        if(typeof query.hasOwnProperty != 'function' || query.hasOwnProperty(f)){
            arr.push(`${f}=${encodeURIComponent(query[f])}`);
        }
    }

    s = arr.join('&');

    if(s && !/\?$/.test(uri)){
        s = '?'+s;
    }

    return `${uri}${s}`;
}

app.use(bodyParser());
app.use(session(app));
app.use(router.routes());

app.listen(3001, function(){
    console.log('oauth client listening on port 3001');
    console.log('please visit http://localhost:3001/sample_app');
});

