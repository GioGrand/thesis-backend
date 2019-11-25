const Router = require('koa-router');
const router = new Router();
const authenticated = require('./../middleware/authenticated');

const auth = require('./../controllers/auth');
const dashboard = require('./../controllers/dashboard');
const exercises = require('./../controllers/exercises');

// AUTH ROUTES
router.post('/register', auth.register);
router.post('/login', auth.login);

// DASHOBARD ROUTES
router.get('/banana', authenticated, dashboard.summary);

// INTERVIEWERS ROUTES

// EXERCISES ROUTES
router.post('/createExercise', authenticated, exercises.createExercise);
router.get('/getExercises', authenticated, exercises.getExercises);
router.delete('/deleteExercise/:id', authenticated, exercises.deleteExercise);

// APPLICATIONS ROUTES

module.exports = router;
