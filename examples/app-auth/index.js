const express = require('express'),
    exphbs = require('express-handlebars'),
    session = require('express-session'),
    path = require('path'),
    util = require('util'),
    multipart = require('express-formidable').parse,
    bodyParser = require('body-parser'),
    BoxSDK = require('box-node-sdk'),
    Policies7Procedures = '114750074041',
    config = require('config'),
    fileidList = [],
    fileData = [];
const TokenStore = require('./token-store');
// const { renderItemsByStructure, searchLocalFolder, uploadFile, fsWatch, automaticUpload } = require('./utils')
// TODO: Temp hack for bypassing bug: https://stackoverflow.com/questions/10888610/ignore-invalid-self-signed-ssl-certificate-in-node-js-with-https-request
/**
 * Also using adminClient for doing all the API calls, need to fix it.
 * Ref: https://github.com/box/box-node-sdk/blob/master/docs/folders.md
 * FIXME: Need to fix the login bug
 *
 */
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
// ------------------------------------------------------------------------------
// Application Parameters - Fill in with your app's values
// ------------------------------------------------------------------------------
// Set up Express and the Box SDK
let app = express();
let sdk = new BoxSDK({
		clientID: 'e6dos9zn7gmuy3aofzlirz50id8o7hn7',
		clientSecret: 'rrOefhFTROpJTRrXO6V7ZN0USXrkOsIS'
	});
let persistentClient = undefined
// the URL to redirect the user to
var authorize_url = sdk.getAuthorizeURL({
    response_type: 'code'
});
app.engine('hbs', exphbs({
    defaultLayout: 'main',
    extname: '.hbs'
}));
app.set('view engine', 'hbs');
app.set("views", path.join(__dirname, '/views'));
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
var emailClient = '';
app.use(function (req, res, next) {
    if (req.session.email) {
        emailClient = req.session.email;
        //console.log("emailClient" + emailClient);
    }
    next();
});
app.get('/', function (req, res) {
    if (req.session.email) {
        // The user is logged in, send them to their files page
        res.redirect('/filefolders');
    } else {
        // The user is logged out, render the home page
        res.render('home');
    }
});
app.get('/login', function (error, res) {
    res.redirect('https://account.box.com/api/oauth2/authorize?response_type=code&client_id=e6dos9zn7gmuy3aofzlirz50id8o7hn7')
})
var email = '';
app.get('/oauth/callback', function (req, res) {
    let tokenCode = req.query.code;
    sdk.getTokensAuthorizationCodeGrant(tokenCode, null, (err, tokenInfo) => {
        if (err) {
            console.log("103 error", err.stack);
        }
        let tokenStore = new TokenStore('test1');
        try {
            let client = sdk.getPersistentClient(tokenInfo, tokenStore);
            client.users.get(client.CURRENT_USER_ID).then(currentUser => {
                email = currentUser.login;
                req.session.email = email;
            });
            persistentClient = client;
            req.session.email = email;
            // automaticUpload(persistentClient, res);
            // successfully logged in
            res.redirect("/filefolders");
        }
        catch (e) {
            console.warn("121", e);
            res.send("121 error")
        };
    });
})

const ftp = require("basic-ftp")

// example()

async function example() {
    const client = new ftp.Client()
    client.ftp.verbose = true
    try {
        await client.access({
            host: "ftp.box.com",
            user: "very",
            password: "password",
            secure: true
        })
        console.log(await client.list())
        await client.uploadFrom("README.md", "README_FTP.md")
        await client.downloadTo("README_COPY.md", "README_FTP.md")
    }
    catch(err) {
        console.log(err)
    }
    client.close()
}
// The upload endpoint requires the multipart middleware to parse out the upload
// form body, which writes the uploaded file to disk at a temporary location
// multipart()
app.post('/upload', multipart(), function (req, res) {
    // Guard to make sure the user is logged in
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    //Get a read stream to the file that the user uploaded
    var fileStream = fs.createReadStream(req.body.file.path);
    let parentDirIdOption = req.body.parentId;
    //  take root if not exist
    let parentDirId = (parentDirIdOption === null || parentDirIdOption === undefined || parentDirIdOption === "") ? "0" : parentDirIdOption;
    //Make an API call to upload the user's file to Box
    persistentClient.files.uploadFile(parentDirId, req.body.file.name, fileStream, function (err, data) {
        // Once the upload completes, delete the temporary file from disk
        // fs.unlink(req.body.file.path, function () { });
        res.redirect(`/filefolders?fid=${parentDirId}`)
        if (err) {
            console.log("259 upload error ", err);
        }
    });
});
app.get('/filefolders', function (req, res) {
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    let paramId = req.query.fid;
    let isParamUndefined = paramId === undefined;
    let folderIdParam = isParamUndefined ? "0" : paramId;
    persistentClient.folders.getItems(folderIdParam, null, function (err, data) {
        renderItemsByStructure(res, data, err);
    });
});
 function renderItemsByStructure(res,data,err){
	 let fileDataList = [];
	 if(data != undefined){
		let fileData = data.entries;
		if(res){
			for(var i=0;i<fileData.length; i++){
				if(fileDataList.indexOf(fileData[i].id)!== -1){
					break;
				}else{
					let isFile = fileData[i].type == "file"
					let isFolder = fileData[i].type == "folder"
					let entry = {id: fileData[i].id,name: fileData[i].name,type:fileData[i].type,isFile:isFile,isFolder:isFolder}
					fileDataList.push(entry);
				}
			}
		}
	 }
	 return res.render('files',
	 {
		 error:err,
		 errorDetails:util.inspect(err),
		 files:data?fileDataList:[]
	 });
 }
app.get('/logout', function (req, res) {
    // To log the user out, we can simply destroy their session
    req.session.destroy(function () {
        res.redirect('/');
    });
})
app.get('/files', function (req, res) {
    // Guard to make sure the user is logged in
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    //Get the user's files in their root folder.  Box uses folder ID "0" to
    //represent the user's root folder, where we'll be putting all their files.
    persistentClient.folders.getItems('0', null, function (err, data) {
        if (data) {
            fileData = data.entries;
            console.log("inside the /files line:128" + fileData);
            for (var i = 0; i < fileData.length; i++) {
                if (fileidList.indexOf(fileData[i].id) !== -1) {
                    break;
                } else {
                    fileidList.push(fileData[i].id);
                }
            }
        }
        res.render('folders', {
            error: err,
            errorDetails: util.inspect(err),
            files: data ? data.entries : [],
        });
    });
});
app.get('/files/:id', function (req, res) {
    // Guard to make sure the user is logged in
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    //Get the user's files in their root folder.  Box uses folder ID "0" to
    //represent the user's root folder, where we'll be putting all their files.
    persistentClient.files.get(req.params.id, { fields: 'expiring_embed_link', showDownload: true, showAnnotations: true }, function (err, data) {
        if (err) {
            console.log("error" + err);
            res.redirect('/files/' + req.params.id);
            return;
        }
        // console.log("preview data", data);
        res.render('preview', {
            file: data
        });
    })
});
app.post('/folders', function (req, res) {
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    let folderName = req.body.fname;
    let parentDirIdOption = req.body.parentId;
    let isNameUndefined = folderName === undefined;
    //console.log(parentDirIdOption);
    //  take root if not exist
    let parentDirId = (parentDirIdOption === null || parentDirIdOption === undefined || parentDirIdOption === "") ? "0" : parentDirIdOption;
    let newFolderName = isNameUndefined ? `New Folder_${Math.random(0, 20)}` : folderName;
    // console.log(parentDirIdOption, newFolderName)
    persistentClient.folders.create(parentDirId, newFolderName, (err, data) => {
        //console.log("New Folder Created", data);
        res.redirect(`/filefolders?fid=${parentDirId}`);
        if (err) {
			console.log("176 upload error ", err.stack);
        }
    });
});
app.post('/filefolders/:ftype/:id', function (req, res) {
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    let paramId = req.params.id;
    let type = req.params.ftype;
    if (paramId != undefined) {
        if (type === "file") {
            persistentClient.files.delete(paramId)
                .then(() => {
                    console.log("deleted");
                    res.redirect("/filefolders")
                });
        } else if (type == "folder") {
            persistentClient.folders.delete(paramId, { recursive: true })
                .then(() => {
                    console.log("deleted");
                    res.redirect(`/filefolders?fid=${paramId}`)
                });
        } else {
            res.sendStatus(304);
        }
    } else res.sendStatus(304);
});
app.get('/download/:id', function (req, res) {
    // Guard to make sure the user is logged in
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    // API call to get the temporary download URL for the user's file
    persistentClient.files.getDownloadURL(req.params.id, null, function (err, url) {
        if (err) {
            console.log("error" + err);
            res.redirect('/files');
            return;
        }
        // Redirect to the download URL, which will cause the user's browser to
        // start the download
        res.redirect(url);
    });
});
app.get('/preview/:id', function (req, res) {
    // Guard to make sure the user is logged in
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    persistentClient.files.get(req.params.id, { fields: 'expiring_embed_link', showDownload: true, showAnnotations: true }, function (err, data) {
        if (err) {
            console.log("error" + err);
            res.redirect('/files/' + req.params.id);
            return;
        }
 //console.log("preview data" , data);
 res.header('X-Frame-Options', '');
        res.render('preview', {
            file: data
        });
    })
});
app.get('/thumbnail/:id', function (req, res) {
    // Guard to make sure the user is logged in
    if (!persistentClient) {
        res.redirect('/');
        return;
    }
    // API call to get the thumbnail for a file.  This can return either the
    // specific thumbnail image or a URL pointing to a placeholder thumbnail.
    persistentClient.files.getThumbnail(req.params.id, {}, function (err, data) {
        if (err) {
            console.log("error" + err);
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
app.listen(3000);
console.log('Server started!');
console.log('Visit http://localhost:3000/ to start.');
