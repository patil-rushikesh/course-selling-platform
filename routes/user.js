const { Router } = require('express');
const { handleSignIn, handleSignUp, handlePurchases } = require('../controllers/userControllers');
const { userAuth } = require('../middlewares/user');
const { getProfile, updateProfile, changePassword, logout } = require('../controllers/profileController')('user', 'userId');
const lessons = require('../controllers/lessonController');

const userRouter = Router();
userRouter.post('/signup', handleSignUp);
userRouter.post('/signin', handleSignIn);
userRouter.post('/logout', userAuth, logout);
userRouter.get('/me', userAuth, getProfile);
userRouter.patch('/me', userAuth, updateProfile);
userRouter.patch('/me/password', userAuth, changePassword);
userRouter.get('/purchases', userAuth, handlePurchases);
userRouter.get('/courses/:id/lessons', userAuth, lessons.listLessons);
userRouter.get('/courses/:id/progress', userAuth, lessons.getProgress);
userRouter.put('/courses/:id/lessons/:lessonId/progress', userAuth, lessons.updateProgress);

module.exports = { userRouter };
