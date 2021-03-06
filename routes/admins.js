const express = require('express');
const router = express.Router();
const Candidate = require('../models/candidate');
const Admin = require('../models/admin');
const Users = require('../models/candidate');
const Program = require('../models/programs')
const jwt = require('jsonwebtoken');
const config = require('../config.js');
const app = express();
const util = require('../util/util')

var moment = require('moment')

/* GET users listing. */
app.set('secret', config.secret);

/**
 *  Middlewares
 */
router.use(function(req, res, next){
    let token = req.body.token || req.query.token || req.headers['x-access-token'] || req.cookies['token'];
    if(token){
        jwt.verify(token, app.get('secret'), function(err, decoded){
            if(err) {
                res.clearCookie('token');
                res.redirect('/admin');
                //return res.json({success: false, message: 'Token invalido.'});
            }
            else{
                req.auth = true;
                console.log("Authenticated, Token ok");
                next();
            }
        });
    }else{
        console.log("Not authenticated");
        req.auth = false;
        next();
    }
});

/**
 * Has Role Middleware
 */
function hasRole(role) {
    return function(req, res, next) {
        if (req.auth == true) {
            var admin = jwt.verify(req.cookies['token'], app.get('secret'))
            if(role !== admin.university) { 
                const error = new Error();
                error.status = 403; 
                throw error;
             }
            else next();
        }
    }
}

/**
 * Remove cookie, and session
 */
router.get('/logout', function(req, res, next) {
    if (req.auth == true) {
        var admin = jwt.verify(req.cookies['token'], app.get('secret'));
        res.clearCookie('token')
        return res.redirect('/admin')
    }
})

/**
 * Returns the login page of admin
 */
router.get('/', function(req, res, next) {
    res.render('login', {
        title: "LOGIN"
    });
});

/**
 * List a candidate in detail
 */
router.get('/candidate/:_id', function(req, res, next) {
    var admin = jwt.verify(req.cookies['token'], app.get('secret'));
    
    Users.findById(req.params['_id'])
        .populate('programA')
        .populate('programB')
        .populate('pdf')
        .exec(function(err, user) { 
        if(err) { return next(err); }    
        if(admin.university !== user.programA.university && admin.university !== user.programB.university
             && admin.university !== 'GCUB') { 
                const error = new Error();
                error.status = 403; 
                throw error;
             }
        res.render('candidate', {
            moment: moment,
            adminName: admin.university,
            candidate: user,
            pad: util.pad
        });
    });
    
})

/**
 * Lists all inscribers
 * Send a page with all inscribers objects
 */
router.get('/page/:page', function(req, res, next){
  if(req.auth == true){
    var perPage = 10;
    var page = req.params.page || 1
    if(page == 0)
        page = 1
    var admin = jwt.verify(req.cookies['token'], app.get('secret'))
    var ids = []
    if (admin.university === 'GCUB') { return res.redirect('/admin/list/' + req.params.page) }
    Program.find({ university: admin.university }, '_id', function (err, programs) {
        // Building Array
        programs.forEach((program) => {
            ids.push(program._id);
        })
        Users.find({ $or: [ { programA: { $in: ids } }, { programB: { $in: ids } } ]} )
            .skip((perPage * page) - perPage)
            .limit(perPage)
            .populate('programA')
            .populate('programB')
            .exec(function(err, users) { 
            Users.count({ $or: [ { programA: { $in: ids } }, { programB: { $in: ids } } ]}).exec(function(err, count) {
                if(err) console.log(err);
                if(!users){
                /*  
                res.json({
                    success: true,
                    data: {users: []}
                });
                */
                return res.render('listCandidates', {
                    title: "Pagina com todos os cadidatos",
                    message: "Nenhum usuario",
                    data: [],
                    current: page,
                    pages: Math.ceil(count / perPage),
                    adminName: admin.university
                });
                } else{
                    return res.render('listCandidates', {
                        title: "Pagina com todos os cadidatos",
                        message: "Todos os usuarios",
                        data: users,
                        current: page,
                        pages: Math.ceil(count / perPage),
                        adminName: admin.university
                    });
                }
            });
        }) 
    })
  }else{
      res.redirect('/admin');
      //       res.set('Content-Type', 'text/html');
      // res.send('<p> Usuário não autenticado </p>');

  }
});

/**
 * View exclusive for GCUB
 */
router.get('/list/:page', hasRole('GCUB'), function(req, res, next){
    var perPage = 10;
    var page = req.params.page || 1;
    if(req.auth == true){
      var admin = jwt.verify(req.cookies['token'], app.get('secret'))
      var ids = []
      Users.find({})
        .skip((page * perPage) - perPage)
        .limit(perPage)
        .populate('programA')
        .populate('programB')
        .exec(function(err, users) {
            Users.count().exec(function(err, count) {
                if(err) { console.log(err) }
                if(!users) {
                    return res.render('listCandidates', {
                        title: 'Lista com todos os candidatos',
                        message: 'Nenhum usuário',
                        data: [],
                        current: page,
                        pages: Math.ceil(count / perPage),
                        adminName: admin.university
                    })
                    }
                    return res.render('listCandidates', {
                    title: 'Lista com todos os candidatos',
                    message: 'Todos usuários',
                    data: users,
                    current: page,
                    pages: Math.ceil(count / perPage),
                    adminName: admin.university
                })
            })
        })
    }
  });


/**
 * Login
 * username - password
 */
router.post('/', function(req, res){
    if(req.auth == false){
        Admin.findOne({
            name: req.body.name
        }, function(err, admin){
            if(err) console.log(err);
            if(!admin){
                res.render('login', {
                    title: "Login",
                    message: "Usuário nao cadastrado",
                });
//                res.json({success: false, message: "Usuário não encontrado"});

            }else{
                return admin.verify(req.body.password, function(bool){
                    if(bool){
                        console.log("Autenticação ok, redirecionando... para /admin/page");
                        // res.header('token', jwt.sign({
                        //         _id: admin._id,
                        //         name: admin.name
                        //     }, app.get('secret'), {expiresIn: 60*30}));
                        res.cookie('token',  jwt.sign({
                            _id: admin._id,
                            name: admin.name,
                            university: admin.university
                        }, app.get('secret'), {expiresIn: 60*30}));
                        res.redirect('/admin/page/1');
                        /*
                        return res.json({
                            success: true,
                            message: 'Login feito com sucesso',
                            token: jwt.sign({
                                _id: admin._id,
                                name: admin.name
                            }, app.get('secret'), {expiresIn: 60*30})
                        });
                        */
                    }else{
                        res.render('login', {
                            title: "Login",
                            message: "Wrong password",
                        });
                        //return res.json({success: false, message: "Wrong password"});
                    }
                })
            }
        });
    }else{
        // Redirect to /admin/page
        console.log("Redirect actived");
        res.redirect('/admin/page/1');
    }
});

router.get('/pdf/:_id', hasRole('GCUB'), function(req, res, next) {
    Users.findById(req.params['_id'])
        .populate('programA')
        .populate('programB')
        .exec(function(err, candidate){
            if(err) { return next(err) }
            var htmlC = util.buildhtml(candidate);
            return res.pdfFromHTML({
                filename: 'generated.pdf',
                htmlContent: util.buildhtml(candidate),
            });
         })
});

module.exports = router;