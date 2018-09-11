const makeRequest = require('request');

module.exports.getWithToken = function(url, token){
	return new Promise((resolve, reject) => {
		makeRequest({
			url: url,
			rejectUnauthorized: false,
			headers: {
				'Authorization': `${token.type} ${token.token}`
			}
		}, function(error, response, body){
			if(error){
				reject(error);
				return;
			}

			if(/json/i.test(response.headers['content-type'])){
				response.body = JSON.parse(body);
			}
			
			resolve({
				'response': response,
				'body': response.body
			});
		});
	});
}

module.exports.postForm = function(url, formData, headers){
	console.log('formData || you have to get params for the token ============================== \n', formData)
	return new Promise((resolve, reject) => {
		makeRequest.post({ 
			url: url, 
			headers: headers || {}, 
			form: formData, 
			rejectUnauthorized: false 
		},  (error, response, body) => {
			// console.log('url', url, 'error', error, 'response', response, 'body', body)
			console.log('the token url ========================== \n ', 
				url, 
				'get the view of body =========================== \n ', 
				body)
			if(error){
				reject(error);
				return;
			}
			if(/json/i.test(response.headers['content-type'])){
				response.body = JSON.parse(body);
			}
			resolve({
				'response': response,
				'body': response.body
			});
		});
	});
}