/**
 * In my option, 'scope' is something like 'role' in the role-based security machanism. 
 * Note: in the 'role' case, usually we can grant more than one roles to an client/user, but here the 'scope' is just a single string. However you are free to use the string to represent whatever you want, like several sub-scopes by concating those sub-scopes.
 */
const sample_app = {
	'id': 'sample_app',
	'clientSecret': 'this_is_the_client_secret',
	'name': 'Sample App',//custom field
	'scope': 'user_info:read',//a custom scope, indicating that this client is allowed to be authorized to read the user's information
	'grants': [ 'authorization_code', 'refresh_token' ],
	'redirectUris': [ 'http://localhost:3001/receiveGrant' ],
	'accessTokenLifetime': 7200, //not required, default is 3600,
	'refreshTokenLifetime': 3600 * 24 * 30 //not required, default is 2 weeks
};

const registry = {
	clients: {
		'sample_app': sample_app
	},
	scopes: {
		'user_info:read': {
			'desc': 'read user information'
		},
		'user_info:write': {
			'desc': 'modify user information'
		}
	}
};

module.exports = registry;