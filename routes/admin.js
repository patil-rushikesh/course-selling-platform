const { Router } = require('express');
const { adminAuth } = require('../middlewares/admin');
const { handleSignUp, handleSignIn, handleCourseAdd, handleCourseUpdate, handleCourseDelete, handleViewCourses } = require('../controllers/adminControllers');
const { getProfile, updateProfile, changePassword, logout } = require('../controllers/profileController')('admin', 'adminId');
const lessons = require('../controllers/lessonController');
const { getDashboard } = require('../controllers/dashboardController');

const adminRouter = Router();
adminRouter.post('/signup', handleSignUp);
adminRouter.post('/signin', handleSignIn);
adminRouter.post('/logout', adminAuth, logout);
adminRouter.get('/me', adminAuth, getProfile);
adminRouter.patch('/me', adminAuth, updateProfile);
adminRouter.patch('/me/password', adminAuth, changePassword);
adminRouter.get('/dashboard', adminAuth, getDashboard);
adminRouter.post('/course', adminAuth, handleCourseAdd);
adminRouter.put('/course/:id', adminAuth, handleCourseUpdate);
adminRouter.get('/course/view-all', adminAuth, handleViewCourses);
adminRouter.delete('/course/:id', adminAuth, handleCourseDelete);
adminRouter.get('/course/:id/lessons', adminAuth, lessons.listAdminLessons);
adminRouter.post('/course/:id/lessons', adminAuth, lessons.createLesson);
adminRouter.patch('/course/:id/lessons/:lessonId', adminAuth, lessons.updateLesson);
adminRouter.delete('/course/:id/lessons/:lessonId', adminAuth, lessons.deleteLesson);

module.exports = { adminRouter };
