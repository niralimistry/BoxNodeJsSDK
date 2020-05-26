// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------
var express = require('express'),
	exphbs = require('express-handlebars'),
	session = require('express-session'),
	path = require('path'),
	fs = require('fs'),
	util = require('util'),
	multipart = require('express-formidable').parse,
	bodyParser = require('body-parser'),
	BoxSDK = require('box-node-sdk');
	config = require('config');
	fileidList = [];
	fileData = [];

// ------------------------------------------------------------------------------
// Application Parameters - Fill in with your app's values
// ------------------------------------------------------------------------------

// var CLIENT_ID = "fhhp4jcz9petovgl108f6hs3q8vq7g6k",
// 	CLIENT_SECRET = "zBNY2DAcM6ybVqiBRjHJpqNK6WxGCerm",
// 	PUBLIC_KEY_ID = "3sy8xb2q",
// 	PRIVATE_KEY_PATH = "D:\lazard\box-node-sdk-master\examples\app-auth\"
// 	PRIVATE_KEY_PASSPHRASE = "2c8545e2f379580d0b7d3cee8d54e3d5",
// 	ENTERPRISE_ID = "324660883";

// Set up Express and the Box SDK
var app = express(),
	sdk = new BoxSDK({
		clientID: config.get('boxAppSettings.clientID'),
    clientSecret: config.get('boxAppSettings.clientSecret'),
    appAuth: {
      keyID: config.get('boxAppSettings.appAuth.publicKeyID'),
      privateKey: config.get('boxAppSettings.appAuth.privateKey'),
      passphrase: config.get('boxAppSettings.appAuth.passphrase')
    }
});

// Use a single SDK client for the app admin, which will perform all operations
// around user management
var adminAPIClient = sdk.getAppAuthClient('enterprise', "324660883");

// var config = new BoxConfig("e6dos9zn7gmuy3aofzlirz50id8o7hn7", "N/A", new Uri("https://localhost:3000"));
// var session = new OAuthSession("Nxc2EAeZRvhEuZW5sQagkXRCC3MPmUxA", "N/A", 3600, "bearer");
// var client = new BoxClient(config, session);

var BoxSDK = require('box-node-sdk');
var sdk = new BoxSDK({
	clientID: 'e6dos9zn7gmuy3aofzlirz50id8o7hn7',
	clientSecret: 'rrOefhFTROpJTRrXO6V7ZN0USXrkOsIS'
});

// the URL to redirect the user to

var authorize_url = sdk.getAuthorizeURL({
	response_type: 'code'
});


console.log("authorize" + authorize_url);


app.get('/:authorize_url',function(error,res){
	res.redirect('https://account.box.com/api/oauth2/authorize?response_type=code&client_id=e6dos9zn7gmuy3aofzlirz50id8o7hn7')
})

let TokenStore = require('./token-store');

// var client = undefined
// function getClient() {
// 	client
// }
// function setCient(client) {
// 	cli
// }

app.get('/oauth/callback', function(req, res){
	console.log(req.query);
	let tokenCode = req.query.code;
	sdk.getTokensAuthorizationCodeGrant(tokenCode, null, (err, tokenInfo) => {

		if (err) {
			// handle error
		}
	console.log("tokenInfo" , tokenInfo);
		let tokenStore = new TokenStore('test1');
		try {
			let client = sdk.getPersistentClient(tokenInfo, tokenStore);
			client.folders.getItems('0').then(value => {
				console.log(value)
				res.render('folder',{
					folder : value.entries
				})
			})
			//console.log(client);
			
		} catch(e){
			console.warn(e)
		}

		
	
	});
})

app.use(function(req, res, next) {
	debugger;
    req.getUrl = function() {
      return req.protocol + "://" + req.get('host') + req.originalUrl;
    }
    return next();
  });

//let token =  sdk.getTokensAuthorizationCodeGrant('shFxe5HHJStYxYsHVkqEJn6VfsnPJmNf', null 
// function(err, tokenInfo) {

// 	if (err) {
// 		// handle error
// 	}
// 		console.log(tokenInfo);

// 		let client = sdk.getPersistentClient(tokenInfo, null);
// 		console.log("client" + client);



// 	// tokenStore.write(tokenInfo, function(storeErr) {

// 	// 	if (storeErr) {
// 	// 		// handle token write error
// 	// 	}
	
// 	// });
// }
// ).then(value => {
// 	console.log("Tokem" , value);
// })

// console.log("asfsadfdsaf", token)

// Set up the templating engine (Handlebars)
app.engine('hbs', exphbs({
	defaultLayout: 'main',
	extname: '.hbs'
}));
app.set('view engine', 'hbs');

// We need to parse POST bodies for form submissions
app.use(bodyParser.urlencoded({
	extended: false
}));

// Set up sessions, so we can log users in and out
app.use(session({
	secret: 'session secret',
	resave: false,
	saveUninitialized: false
}));

// User authentication middleware
// For this sample app, we trust that as long as the user's email has been set
// in the session, that they have been properly authenticated and we can create
// an SDK client for them
app.use(function(req, res, next) {
	if (req.session.email) {
		res.locals.email = req.session.email;
		req.sdk = sdk.getAppAuthClient('user', req.session.userID);
	}
	next();
});

app.get('/', function(req, res) {

	if (req.session.email) {
		// The user is logged in, send them to their files page
		res.redirect('/files');
	} else {
		// The user is logged out, render the home page
		res.render('home');
	}
});

app.get('/login', function(req, res) {
	// console.log("inside" + fileidList);
	res.render('login');
});

app.post('/login', function(req, res) {

	var email = req.body.email;

	var requestParams = {
		qs: {
			filter_term: email
		}
	};
	// Make an API request to get all users whose name starts with the provided email address
	// Since we use the Box name field to hold the email address that the user
	// registered with, this should give us the correct user object, if they've already
	// signed up.
	adminAPIClient.get('/users', requestParams, adminAPIClient.defaultResponseHandler(function(err, data) {

		if (err) {
			res.render('login', {
				error: 'An error occurred during login - ' + err.message,
				errorDetails: util.inspect(err)
			});
			return;
		}

		// Since the API call only checks that the filter term is a prefix, we
		// might get many matching records back from the API, so we need to
		// verify that there is an exact match before logging the user in
		var user = data.entries.find(match => match.name === email);
		if (!user) {
			res.render('login', {
				error: 'User not found'
			});
			return;
		}

		// Set up the user's logged-in session
		req.session.email = email;
		req.session.userID = user.id;
		res.redirect('/files');
	}));
});

app.get('/signup', function(req, res) {
	res.render('signup');
});

app.post('/signup', function(req, res) {
	var requestParams = {
		body: {
			name: req.body.email,
			is_platform_access_only: true
		}
	};
	// Create a new Box user record for this user, using the name field to hold the
	// email address they registered with.  This allows us to use Box to keep track
	// of all our users, so we don't need a separate database for this sample app
	adminAPIClient.post('/users', requestParams, adminAPIClient.defaultResponseHandler(function(err, data) {

		if (err) {
			res.render('signup', {
				error: 'An error occurred during signup - ' + err.message,
				errorDetails: util.inspect(err)
			});
			return;
		}

		// If the user was created correctly, set up their logged-in session
		req.session.email = req.body.email;
		req.session.userID = data.id;
		res.redirect('/files');
	}));
});

app.get('/files', function(req, res) {

	// Guard to make sure the user is logged in
	if (!req.sdk) {
		res.redirect('/');
		return;
	}
	
	// Get the user's files in their root folder.  Box uses folder ID "0" to
	// represent the user's root folder, where we'll be putting all their files.
	req.sdk.folders.getItems('0', null, function(err, data) {
		if(res){
			fileData = data.entries;
			console.log(fileData);
			for (var i = 0; i < fileData.length; i++) {
				if(fileidList. indexOf(fileData[i].id) !== -1){
					break;
				}else{
					fileidList.push(fileData[i].id);
				}
			}
			console.log("fileidList " + fileidList);
		}
		res.render('files', {
			error: err,
			errorDetails: util.inspect(err),
			files: data ? data.entries: [],
			
		});
	});
});



// The upload endpoint requires the multipart middleware to parse out the upload
// form body, which writes the uploaded file to disk at a temporary location
app.post('/upload', multipart(), function(req, res) {

	// Guard to make sure the user is logged in
	if (!req.sdk) {
		res.redirect('/');
		return;
	}

	// Get a read stream to the file that the user uploaded
	var fileStream = fs.createReadStream(req.body.file.path);
	// Make an API call to upload the user's file to Box
	req.sdk.files.uploadFile('0', req.body.file.name, fileStream, function(err, data) {

		// Once the upload completes, delete the temporary file from disk
		fs.unlink(req.body.file.path, function() {});

		res.redirect('/files');
	});
});

app.get('/download/:id', function(req, res) {

	// Guard to make sure the user is logged in
	if (!req.sdk) {
		res.redirect('/');
		return;
	}

	// API call to get the temporary download URL for the user's file
	req.sdk.files.getDownloadURL(req.params.id, null, function(err, url) {

		if (err) {
			res.redirect('/files');
			return;
		}

		// Redirect to the download URL, which will cause the user's browser to
		// start the download
		res.redirect(url);
	});
});

app.get('/preview/:id', function(req, res) {

	// Guard to make sure the user is logged in
	if (!req.sdk) {
		res.redirect('/');
		return;
	}

	// The Box file object has a field called "expiring_embed_link", which can
	// be used to embed a preview of the file.  We'll fetch this field only.
	req.sdk.files.get(req.params.id, {fields: 'expiring_embed_link'}, function(err, data) {
		if (err) {
			res.redirect('/files');
			return;
		}

		res.render('preview', {
			file: data
		});
	})
});

app.get('/thumbnail/:id', function(req, res) {

	// Guard to make sure the user is logged in
	if (!req.sdk) {
		res.redirect('/');
		return;
	}

	// API call to get the thumbnail for a file.  This can return either the
	// specific thumbnail image or a URL pointing to a placeholder thumbnail.
	req.sdk.files.getThumbnail(req.params.id, {}, function(err, data) {

		if (err) {
			res.status(err.statusCode || 500).json(err);
			return;
		}

		if (data.file) {
			// We got the thumbnail file, so send the image bytes back
			res.send(data.file);
		} else if (data.location) {
			// We got a placeholder URL, so redirect the user there
			res.redirect(data.location);
		} else {
			// Something went wrong, so return a 500
			res.status(500).end();
		}
	});
});

app.get('/logout', function(req, res) {

	// To log the user out, we can simply destroy their session
	req.session.destroy(function() {
		res.redirect('/');
	});
})



// var preview = new Box.Preview();
// preview.show(configData.FILE_ID, configData.ACCESS_TOKEN, {
//   container: '.preview-container',
//   showDownload: true,
//   // Comment out the following if you are using your own access token and file ID
//   collection: [configData.FILE_ID, configData.FILE_ID_VIDEO]
// });

app.listen(3000);
console.log('Server started!');
console.log('Visit http://localhost:3000/ to start.');